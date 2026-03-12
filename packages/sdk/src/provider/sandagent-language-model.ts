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
import { type Message, type RunnerSpec, SandAgent } from "@sandagent/manager";
import type {
  Logger,
  SandAgentModelId,
  SandAgentProviderSettings,
} from "./types";

/**
 * Options for creating a SandAgent language model instance.
 */
export interface SandAgentLanguageModelOptions {
  id: SandAgentModelId;
  options: SandAgentProviderSettings & { runner: RunnerSpec };
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

function getLogger(settings: SandAgentProviderSettings): Logger {
  if (settings.logger === false) {
    return {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  if (settings.logger) {
    return settings.logger;
  }

  const isVerbose = settings.verbose ?? false;
  return {
    debug: (msg) => isVerbose && console.debug(msg),
    info: (msg) => isVerbose && console.info(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
  };
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
 * SandAgent Language Model implementation for AI SDK.
 */
export class SandAgentLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "sandagent";
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {
    "image/*": [/.*/],
  };

  private readonly options: SandAgentProviderSettings & { runner: RunnerSpec };
  private readonly logger: Logger;
  private sessionId: string | undefined;
  private toolNameMap: Map<string, string> = new Map();

  constructor(modelOptions: SandAgentLanguageModelOptions) {
    this.modelId = modelOptions.id;
    this.options = modelOptions.options;
    this.logger = getLogger(modelOptions.options);
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
    const allMessages = this.convertPromptToMessages(prompt);

    // Extract system messages and merge into runner.systemPrompt.
    // Gemini (Vertex AI) rejects role:"system" in messages — only "user" and
    // "model" are valid.  By folding system content into the runner's
    // systemPrompt CLI flag we keep all providers happy.
    const systemParts: string[] = [];
    const messages: Message[] = [];
    for (const m of allMessages) {
      if (m.role === "system") {
        systemParts.push(m.content);
      } else {
        messages.push(m);
      }
    }

    const runner = this.options.runner;
    if (systemParts.length > 0) {
      const extra = systemParts.join("\n");
      runner.systemPrompt = runner.systemPrompt
        ? `${runner.systemPrompt}\n${extra}`
        : extra;
    }

    this.logger.debug(
      `[sandagent] Starting stream with ${messages.length} messages`,
    );

    const sandbox = this.options.sandbox;
    const sandboxEnv = sandbox.getEnv?.() ?? {};
    const sandboxWorkdir =
      this.options.cwd ?? sandbox.getWorkdir?.() ?? "/workspace";

    const agent = new SandAgent({
      sandbox: this.options.sandbox,
      runner,
      env: { ...sandboxEnv, ...this.options.env },
    });

    try {
      const stream = await agent.stream({
        messages,
        workspace: {
          path: sandboxWorkdir,
        },
        resume: this.options.resume,
        signal: abortSignal,
      });

      const self = this;
      const reader = stream.getReader();

      if (!reader) {
        throw new Error("Response body is not readable");
      }

      const outputStream = new ReadableStream<LanguageModelV3StreamPart>({
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
                if (line.startsWith("data: ")) {
                  const data = line.slice(6);

                  if (data === "[DONE]") {
                    foundDone = true;
                    continue;
                  }
                  try {
                    const parts = self.parseSSEData(data);
                    for (const part of parts) {
                      controller.enqueue(part);

                      if (self.sessionId) {
                        const sessionId: string = self.sessionId;

                        if (self.options.artifactProcessors?.length) {
                          for (const processor of self.options
                            .artifactProcessors) {
                            Promise.resolve()
                              .then(() => processor.onChange(part, sessionId))
                              .catch((e) => {
                                self.logger.error(
                                  `[sandagent] Artifact processor error: ${e}`,
                                );
                              });
                          }
                        }
                      }
                    }
                  } catch (e) {
                    self.logger.error(
                      `[sandagent] Failed to parse SSE data: ${e}`,
                    );
                  }
                }
              }

              if (foundDone) {
                controller.close();
                return;
              }
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              self.logger.info("[sandagent] Stream aborted by user");
            } else {
              self.logger.error(
                `[sandagent] Stream error: ${formatErrorForLog(error)}`,
              );
            }
            controller.error(error);
          }
        },

        cancel() {
          reader.cancel();
        },
      });

      return {
        stream: outputStream,
        request: {
          body: JSON.stringify({ messages }),
        },
      };
    } catch (error) {
      await agent.destroy().catch(() => {});
      throw error;
    }
  }

  private parseSSEBuffer(buffer: string): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    const lines = buffer.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);

        if (data === "[DONE]") {
          continue;
        }

        try {
          const parsedParts = this.parseSSEData(data);
          parts.push(...parsedParts);
        } catch (e) {
          this.logger.error(`[sandagent] Failed to parse SSE data: ${e}`);
        }
      }
    }

    return parts;
  }

  private parseSSEData(data: string): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    const parsed = JSON.parse(data) as Record<string, unknown>;

    switch (parsed.type) {
      case "start": {
        break;
      }

      case "message-metadata": {
        const metadata = parsed.messageMetadata as Record<string, unknown>;
        if (metadata?.sessionId && typeof metadata.sessionId === "string") {
          this.sessionId = metadata.sessionId;
          this.logger.debug(
            `[sandagent] Session ID extracted: ${this.sessionId}`,
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
            sandagent: {
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
          error: new Error(parsed.errorText as string),
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
            sandagent: {
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
          const textParts = message.content
            .filter(
              (part): part is { type: "text"; text: string } =>
                part.type === "text",
            )
            .map((part) => part.text);

          if (textParts.length > 0) {
            messages.push({
              role: "user",
              content: textParts.join("\n"),
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
