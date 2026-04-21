import type {
  JSONObject,
  JSONValue,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3Prompt,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
  SharedV3ProviderMetadata,
  SharedV3Warning,
} from "@ai-sdk/provider";
import {
  BunnyAgent,
  type BunnyAgentCodingRunBody,
  type Message,
  type RunnerSpec,
  streamCodingRunFromSandbox,
} from "@bunny-agent/manager";
import { getProviderLogger } from "./logging";
import type {
  BunnyAgentModelId,
  BunnyAgentProviderSettings,
  Logger,
} from "./types";

/**
 * Options for creating a BunnyAgent language model instance.
 */
export interface BunnyAgentLanguageModelOptions {
  id: BunnyAgentModelId;
  options: BunnyAgentProviderSettings & { runner: RunnerSpec };
}

/** Format error so message and cause chain are visible (e.g. includes "Fatal error: ..." from runner). */
function formatErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.message];
    let cause: unknown = error.cause;
    while (cause instanceof Error) {
      parts.push(cause.message);
      cause = cause.cause;
    }
    return parts.join(" | cause: ");
  }
  return String(error);
}

/** Bridge async iterable (sandbox exec / curl) to Web ReadableStream for SSE parsing. */
function asyncIterableToReadableStream(
  iterable: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        if (value.byteLength > 0) {
          controller.enqueue(value);
          return;
        }
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}

function getLastUserTextFromMessages(messages: Message[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  const c = lastUser.content;
  if (typeof c === "string") return c;
  return c
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function createEmptyUsage(): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: 0,
      noCache: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: {
      total: 0,
      text: undefined,
      reasoning: undefined,
    },
    raw: undefined,
  };
}

/**
 * BunnyAgent Language Model implementation for AI SDK.
 */
export class BunnyAgentLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {
    "image/*": [/.*/],
  };

  private readonly options: BunnyAgentProviderSettings & { runner: RunnerSpec };
  private readonly logger: Logger;
  private sessionId: string | undefined;
  private toolNameMap: Map<string, string> = new Map();
  private legacyTextPartCounter = 0;

  private logUnparsedStreamLine(candidate: string, error: unknown): void {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const looksLikeError = /\b(error|failed|exception|traceback|fatal)\b/i.test(
      trimmed,
    );
    if (looksLikeError) {
      const snippet = trimmed.slice(0, 500);
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[bunny-agent] Unparsed stream line (likely runner error): ${snippet} | parser: ${msg}`,
      );
    }
  }

  constructor(modelOptions: BunnyAgentLanguageModelOptions) {
    this.modelId = modelOptions.id;
    this.options = modelOptions.options;
    this.logger = getProviderLogger(modelOptions.options);
    this.provider = modelOptions.options.daemonUrl
      ? "bunny-agent-daemon"
      : "bunny-agent";
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const { stream, request } = await this.doStream(options);
    const reader = stream.getReader();

    const content: LanguageModelV3Content[] = [];
    const warnings: SharedV3Warning[] = [];
    let finishReason: LanguageModelV3FinishReason = {
      unified: "other",
      raw: undefined,
    };
    let usage: LanguageModelV3Usage = createEmptyUsage();
    let providerMetadata: SharedV3ProviderMetadata | undefined;

    const textParts: Map<string, { text: string }> = new Map();
    const toolInputs: Map<string, { toolName: string; input: string }> =
      new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        switch (value.type) {
          case "text-start": {
            textParts.set(value.id, { text: "" });
            break;
          }
          case "text-delta": {
            const part = textParts.get(value.id);
            if (part) {
              part.text += value.delta;
            }
            break;
          }
          case "text-end": {
            const part = textParts.get(value.id);
            if (part) {
              content.push({
                type: "text",
                text: part.text,
              });
            }
            break;
          }
          case "tool-input-start": {
            toolInputs.set(value.id, { toolName: value.toolName, input: "" });
            break;
          }
          case "tool-input-delta": {
            const tool = toolInputs.get(value.id);
            if (tool) {
              tool.input += value.delta;
            }
            break;
          }
          case "tool-input-end": {
            break;
          }
          case "tool-call": {
            content.push({
              type: "tool-call",
              toolCallId: value.toolCallId,
              toolName: value.toolName,
              input: value.input,
              providerExecuted: value.providerExecuted,
            });
            break;
          }
          case "stream-start": {
            warnings.push(...value.warnings);
            break;
          }
          case "error": {
            // `value.error` type comes from AI SDK and can be `{}`-shaped.
            // Convert it to a readable string safely.
            const message =
              value.error instanceof Error
                ? value.error.message
                : typeof value.error === "string"
                  ? value.error
                  : value.error
                    ? String(value.error)
                    : "Unknown error";

            // Surface errors as assistant text + mark finishReason=error.
            content.push({ type: "text", text: message });
            finishReason = { unified: "error", raw: "error" };
            break;
          }
          case "finish": {
            finishReason = value.finishReason;
            usage = value.usage;
            providerMetadata = value.providerMetadata;
            break;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      content,
      finishReason,
      usage,
      providerMetadata,
      request,
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { prompt, abortSignal } = options;
    const messages = this.convertPromptToMessages(prompt);

    this.resetStreamState();

    this.logger.debug(
      `[bunny-agent] Starting stream with ${messages.length} messages`,
    );

    const sandbox = this.options.sandbox;
    if (!sandbox) {
      throw new Error(
        "BunnyAgent language model requires a sandbox adapter (set `sandbox` on the provider).",
      );
    }

    const daemonUrl = this.options.daemonUrl;

    if (daemonUrl) {
      const handle = await sandbox.attach();
      const sandboxEnv = sandbox.getEnv?.() ?? {};
      const runnerEnv = { ...sandboxEnv, ...this.options.env };
      const body: BunnyAgentCodingRunBody = {
        ...this.buildCodingRunBody(messages, handle.getWorkdir()),
        ...(Object.keys(runnerEnv).length > 0 ? { env: runnerEnv } : {}),
      };
      const execOpts = {
        cwd: this.options.cwd ?? handle.getWorkdir(),
        signal: abortSignal,
      };
      const iterable = streamCodingRunFromSandbox(
        handle,
        daemonUrl,
        body,
        execOpts,
      );
      const bytesStream = asyncIterableToReadableStream(iterable);
      return this.buildStreamResult(bytesStream, messages);
    }

    const sandboxEnv = sandbox.getEnv?.() ?? {};
    const sandboxWorkdir =
      this.options.cwd ?? sandbox.getWorkdir?.() ?? "/workspace";

    const agent = new BunnyAgent({
      sandbox,
      runner: this.options.runner,
      env: { ...sandboxEnv, ...this.options.env },
    });

    try {
      const bytesStream = await agent.stream({
        messages,
        workspace: {
          path: sandboxWorkdir,
        },
        resume: this.options.resume,
        signal: abortSignal,
      });
      return this.buildStreamResult(bytesStream, messages);
    } catch (error) {
      await agent.destroy().catch(() => {});
      throw error;
    }
  }

  private resetStreamState(): void {
    this.sessionId = undefined;
    this.toolNameMap = new Map();
    this.legacyTextPartCounter = 0;
  }

  private buildCodingRunBody(
    messages: Message[],
    cwdFallback: string,
  ): BunnyAgentCodingRunBody {
    const runner = this.options.runner;
    const cwd = this.options.cwd ?? cwdFallback;
    return {
      runner: runner.runnerType ?? "claude",
      model: this.modelId,
      userInput: getLastUserTextFromMessages(messages),
      cwd,
      resume: this.options.resume,
      systemPrompt: this.options.systemPrompt ?? runner.systemPrompt,
      maxTurns: this.options.maxTurns ?? runner.maxTurns,
      allowedTools: runner.allowedTools ?? this.options.allowedTools,
      skillPaths: runner.skillPaths ?? this.options.skillPaths,
      yolo: this.options.yolo,
    };
  }

  private buildStreamResult(
    bytesStream: ReadableStream<Uint8Array>,
    messages: Message[],
  ): LanguageModelV3StreamResult {
    const reader = bytesStream.getReader();

    return {
      stream: this.createLanguageModelStreamFromSseReader(reader),
      request: {
        body: JSON.stringify({ messages }),
      },
    };
  }

  private createLanguageModelStreamFromSseReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): ReadableStream<LanguageModelV3StreamPart> {
    const self = this;

    return new ReadableStream<LanguageModelV3StreamPart>({
      async start(controller) {
        try {
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              if (buffer.trim()) {
                const parts = self.parseSSEBuffer(buffer);
                for (const part of parts) {
                  controller.enqueue(part);
                }
              }
              controller.close();
              break;
            }

            const text = new TextDecoder().decode(value);
            buffer += text;

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let foundDone = false;
            for (const line of lines) {
              const candidate = line.startsWith("data: ")
                ? line.slice(6)
                : line.trim();
              if (!candidate) continue;
              if (candidate === "[DONE]") {
                foundDone = true;
                continue;
              }

              try {
                const parts = self.parseSSEData(candidate);
                for (const part of parts) {
                  controller.enqueue(part);

                  if (self.sessionId) {
                    const sessionId: string = self.sessionId;

                    if (self.options.artifactProcessors?.length) {
                      for (const processor of self.options.artifactProcessors) {
                        Promise.resolve()
                          .then(() => processor.onChange(part, sessionId))
                          .catch((e) => {
                            self.logger.error(
                              `[bunny-agent] Artifact processor error: ${e}`,
                            );
                          });
                      }
                    }
                  }
                }
              } catch (e) {
                // daemon /api/coding/run or CLI runner may emit plain text lines.
                // Log suspicious lines so silent "finish: other" can be diagnosed.
                self.logUnparsedStreamLine(candidate, e);
              }
            }

            if (foundDone) {
              controller.close();
              return;
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            self.logger.info("[bunny-agent] Stream aborted by user");
          } else {
            self.logger.error(
              `[bunny-agent] Stream error: ${formatErrorForLog(error)}`,
            );
          }
          controller.error(error);
        }
      },

      cancel() {
        reader.cancel();
      },
    });
  }

  private parseSSEBuffer(buffer: string): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    const lines = buffer.split("\n");

    for (const line of lines) {
      const candidate = line.startsWith("data: ") ? line.slice(6) : line.trim();
      if (!candidate || candidate === "[DONE]") continue;
      try {
        const parsedParts = this.parseSSEData(candidate);
        parts.push(...parsedParts);
      } catch (e) {
        this.logUnparsedStreamLine(candidate, e);
      }
    }

    return parts;
  }

  private parseSSEData(data: string): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const parsedType =
      typeof parsed.type === "string" ? parsed.type : undefined;

    // daemon NDJSON errors may arrive as: {"error":"..."} (without type)
    if (!parsedType && typeof parsed.error === "string") {
      return [
        {
          type: "error",
          error: new Error(parsed.error),
        },
      ];
    }

    switch (parsedType) {
      case "start": {
        break;
      }

      // Backward-compatible NDJSON chunk from daemon tests/mock runners.
      case "text": {
        const text = typeof parsed.text === "string" ? parsed.text : "";
        if (text.length > 0) {
          const id = `legacy-text-${++this.legacyTextPartCounter}`;
          parts.push(
            {
              type: "text-start",
              id,
              providerMetadata: {
                "bunny-agent": {
                  sessionId: this.sessionId,
                } as unknown as SharedV3ProviderMetadata,
              },
            },
            { type: "text-delta", id, delta: text },
            { type: "text-end", id },
          );
        }
        break;
      }

      case "message-metadata": {
        const metadata = parsed.messageMetadata as Record<string, unknown>;
        if (metadata?.sessionId && typeof metadata.sessionId === "string") {
          this.sessionId = metadata.sessionId;
          this.logger.debug(
            `[bunny-agent] Session ID extracted: ${this.sessionId}`,
          );
          parts.push({
            type: "raw",
            rawValue: this.sessionId,
          });
        }
        break;
      }

      case "text-start": {
        parts.push({
          type: "text-start",
          id: parsed.id as string,
          providerMetadata: {
            "bunny-agent": {
              sessionId: this.sessionId,
            } as unknown as SharedV3ProviderMetadata,
          },
        });
        break;
      }

      case "text-delta": {
        parts.push({
          type: "text-delta",
          id: parsed.id as string,
          delta: parsed.delta as string,
        });
        break;
      }

      case "text-end": {
        parts.push({
          type: "text-end",
          id: parsed.id as string,
        });
        break;
      }

      case "tool-input-start": {
        parts.push({
          type: "tool-input-start",
          id: parsed.toolCallId as string,
          toolName: parsed.toolName as string,
          dynamic: parsed.dynamic as boolean,
          providerExecuted: parsed.providerExecuted as boolean,
        });
        break;
      }

      case "tool-input-delta": {
        parts.push({
          type: "tool-input-delta",
          id: parsed.toolCallId as string,
          delta: parsed.inputTextDelta as string,
        });
        break;
      }
      case "tool-input-available": {
        const toolCallId = parsed.toolCallId as string;
        const toolName = parsed.toolName as string;
        const input = parsed.input as Record<string, unknown>;
        this.toolNameMap.set(toolCallId, toolName);
        parts.push({
          type: "tool-call",
          toolCallId,
          toolName,
          input: JSON.stringify(input),
          dynamic: parsed.dynamic as boolean,
          providerExecuted: parsed.providerExecuted as boolean,
        });
        break;
      }

      case "tool-output-available": {
        const toolName = this.toolNameMap.get(parsed.toolCallId as string);
        parts.push({
          type: "tool-result",
          toolCallId: parsed.toolCallId as string,
          toolName: toolName ?? "",
          result: parsed.output as NonNullable<JSONValue>,
          isError: parsed.isError as boolean,
          dynamic: parsed.dynamic as boolean,
        });
        break;
      }
      case "error": {
        parts.push({
          type: "error",
          error: new Error(
            (parsed.errorText as string) ||
              (parsed.error as string) ||
              "Unknown stream error",
          ),
        });
        break;
      }

      case "finish": {
        const rawFinishReason = parsed.finishReason;
        let finishReason: LanguageModelV3FinishReason;

        if (
          typeof rawFinishReason === "object" &&
          rawFinishReason !== null &&
          "unified" in rawFinishReason
        ) {
          finishReason = rawFinishReason as LanguageModelV3FinishReason;
        } else {
          finishReason = this.mapFinishReason(rawFinishReason as string);
        }

        const messageMetadata = parsed.messageMetadata as
          | { usage?: Record<string, unknown> }
          | undefined;
        const rawUsage = messageMetadata?.usage;
        const usage = this.convertUsage(rawUsage);

        parts.push({
          type: "finish",
          finishReason,
          usage,
          providerMetadata: {
            "bunny-agent": {
              ...((parsed.messageMetadata as Record<string, unknown>) ?? {}),
              sessionId: this.sessionId,
            } as unknown as SharedV3ProviderMetadata,
          },
        });
        break;
      }
    }

    return parts;
  }

  private convertPromptToMessages(prompt: LanguageModelV3Prompt): Message[] {
    const messages: Message[] = [];

    for (const message of prompt) {
      switch (message.role) {
        case "system": {
          messages.push({
            role: "system",
            content: message.content,
          });
          break;
        }

        case "user": {
          const parts = message.content
            .map((part) => {
              if (part.type === "text") {
                return { type: "text" as const, text: part.text };
              }
              if (part.type === "file") {
                // LanguageModelV3FilePart: data is Uint8Array | string | URL, mediaType is IANA type
                let dataStr = "";
                if (part.data instanceof Uint8Array) {
                  dataStr = `data:${part.mediaType};base64,${Buffer.from(part.data).toString("base64")}`;
                } else if (part.data instanceof URL) {
                  dataStr = part.data.toString();
                } else if (typeof part.data === "string") {
                  // Already a data URL or base64 string
                  dataStr = part.data;
                }
                return {
                  type: "image" as const,
                  mimeType: part.mediaType || "image/png",
                  data: dataStr,
                };
              }
              return null;
            })
            .filter(
              (
                p,
              ): p is
                | { type: "text"; text: string }
                | { type: "image"; mimeType: string; data: string } =>
                p !== null,
            );

          if (parts.length > 0) {
            // If only text parts, combine them into a string for cleaner payload, else pass array
            const isAllText = parts.every((p) => p.type === "text");
            messages.push({
              role: "user",
              content: isAllText
                ? parts
                    .map((p) => (p as { type: "text"; text: string }).text)
                    .join("\n")
                : parts,
            });
          }
          break;
        }

        case "assistant": {
          const textParts = message.content
            .filter(
              (part): part is { type: "text"; text: string } =>
                part.type === "text",
            )
            .map((part) => part.text);

          if (textParts.length > 0) {
            messages.push({
              role: "assistant",
              content: textParts.join("\n"),
            });
          }
          break;
        }

        case "tool": {
          break;
        }
      }
    }

    return messages;
  }

  private mapFinishReason(
    reason: string | undefined,
  ): LanguageModelV3FinishReason {
    switch (reason) {
      case "stop":
        return { unified: "stop", raw: reason };
      case "length":
        return { unified: "length", raw: reason };
      case "tool_calls":
      case "tool-calls":
        return { unified: "tool-calls", raw: reason };
      case "content_filter":
      case "content-filter":
        return { unified: "content-filter", raw: reason };
      case "error":
        return { unified: "error", raw: reason };
      default:
        return { unified: "other", raw: reason ?? "unknown" };
    }
  }

  private convertUsage(
    data: Record<string, unknown> | undefined,
  ): LanguageModelV3Usage {
    if (!data) {
      return createEmptyUsage();
    }

    if ("inputTokens" in data && "outputTokens" in data) {
      const inputTokens = data.inputTokens as Record<string, number>;
      const outputTokens = data.outputTokens as Record<string, number>;
      // Check if there's a raw field in the data
      const rawData =
        "raw" in data ? (data.raw as Record<string, unknown>) : data;

      return {
        inputTokens: {
          total: inputTokens.total ?? 0,
          noCache: inputTokens.noCache ?? 0,
          cacheRead: inputTokens.cacheRead ?? 0,
          cacheWrite: inputTokens.cacheWrite ?? 0,
        },
        outputTokens: {
          total: outputTokens.total ?? 0,
          text: outputTokens.text ?? outputTokens.textTokens ?? undefined,
          reasoning:
            outputTokens.reasoning ?? outputTokens.reasoningTokens ?? undefined,
        },
        raw: rawData as JSONObject,
      };
    }

    const usage = (data.usage ?? data) as Record<string, number | undefined>;

    if ("input_tokens" in usage || "output_tokens" in usage) {
      const inputTokens = (usage.input_tokens as number) ?? 0;
      const outputTokens = (usage.output_tokens as number) ?? 0;
      const cacheWrite = (usage.cache_creation_input_tokens as number) ?? 0;
      const cacheRead = (usage.cache_read_input_tokens as number) ?? 0;
      // Check for text/reasoning tokens if available
      const textTokens = (usage.text_tokens as number) ?? undefined;
      const reasoningTokens = (usage.reasoning_tokens as number) ?? undefined;

      return {
        inputTokens: {
          total: inputTokens + cacheWrite + cacheRead,
          noCache: inputTokens,
          cacheRead,
          cacheWrite,
        },
        outputTokens: {
          total: outputTokens,
          text: textTokens,
          reasoning: reasoningTokens,
        },
        raw: usage as JSONObject,
      };
    }

    return createEmptyUsage();
  }
}
