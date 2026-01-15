import type {
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
import { generateId } from "@ai-sdk/provider-utils";
import { type Message, SandAgent } from "@sandagent/core";
import type { Logger, SandAgentModelId, SandAgentSettings } from "./types.js";
import { resolveModelId } from "./types.js";

/**
 * Options for creating a SandAgent language model instance.
 */
export interface SandAgentLanguageModelOptions {
  /**
   * The model identifier to use.
   */
  id: SandAgentModelId;

  /**
   * Settings to configure the model behavior.
   */
  settings: SandAgentSettings;
}

/**
 * Get a logger instance based on settings.
 */
function getLogger(settings: SandAgentSettings): Logger {
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

  // Default console logger
  const isVerbose = settings.verbose ?? false;
  return {
    debug: (msg) => isVerbose && console.debug(msg),
    info: (msg) => isVerbose && console.info(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
  };
}

/**
 * Create an empty usage object with all required fields.
 */
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
  };
}

/**
 * SandAgent Language Model implementation for AI SDK.
 *
 * This class implements the AI SDK's LanguageModelV3 interface and runs
 * Claude Agent SDK inside an isolated sandbox environment.
 *
 * @example
 * ```typescript
 * import { SandAgentLanguageModel } from '@sandagent/ai-provider';
 * import { E2BSandbox } from '@sandagent/sandbox-e2b';
 *
 * const model = new SandAgentLanguageModel({
 *   id: 'sonnet',
 *   settings: {
 *     sandbox: new E2BSandbox({ apiKey: 'xxx' }),
 *     env: { ANTHROPIC_API_KEY: 'xxx' },
 *   },
 * });
 * ```
 */
export class SandAgentLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "sandagent";

  /**
   * The resolved model ID (e.g., "claude-sonnet-4-20250514")
   */
  readonly modelId: string;

  /**
   * Supported URL patterns by media type.
   * Claude models support image URLs natively.
   */
  readonly supportedUrls: Record<string, RegExp[]> = {
    "image/*": [/.*/], // Support all image URLs
  };

  private readonly settings: SandAgentSettings;
  private readonly logger: Logger;
  private sessionId: string | undefined;

  constructor(options: SandAgentLanguageModelOptions) {
    this.modelId = resolveModelId(options.id);
    this.settings = options.settings;
    this.logger = getLogger(options.settings);
    this.sessionId = options.settings.sessionId;
  }

  /**
   * Get the session ID for resuming conversations.
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Set the session ID (usually from response metadata).
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Generate a non-streaming response.
   * This collects all stream parts and returns the final result.
   */
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

    // Collect text parts
    const textParts: Map<string, { text: string }> = new Map();
    // Collect tool call inputs
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
            // Tool input complete, will emit tool-call
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

  /**
   * Stream a completion from the model.
   *
   * This is the main method that AI SDK calls for streaming responses.
   */
  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const { prompt, abortSignal } = options;

    // Convert AI SDK prompt to SandAgent messages
    const messages = this.convertPromptToMessages(prompt);

    this.logger.debug(
      `[sandagent] Starting stream with ${messages.length} messages`,
    );

    // Get sandbox-level settings (if available)
    const sandbox = this.settings.sandbox;
    const sandboxEnv = sandbox.getEnv?.() ?? {};
    const sandboxTemplate = sandbox.getAgentTemplate?.() ?? "default";
    const sandboxWorkdir = sandbox.getWorkdir?.() ?? "/workspace";

    // Create SandAgent instance
    // Settings priority: settings > sandbox > defaults
    const agent = new SandAgent({
      id: this.sessionId ?? `sandagent-${generateId()}`,
      sandbox,
      runner: {
        kind: "claude-agent-sdk",
        model: this.modelId,
        template: this.settings.template ?? sandboxTemplate,
        systemPrompt: this.settings.systemPrompt,
        maxTurns: this.settings.maxTurns,
        allowedTools: this.settings.allowedTools,
        approvalDir: this.settings.approvalDir,
      },
      // Merge sandbox env with settings env (settings takes precedence)
      env: { ...sandboxEnv, ...this.settings.env },
    });

    try {
      // Get the streaming response from sandbox
      const response = await agent.stream({
        messages,
        workspace: {
          path: this.settings.cwd ?? sandboxWorkdir,
        },
        resume: this.settings.resume ?? this.sessionId,
        signal: abortSignal,
        transcriptWriter: this.settings.transcriptWriter,
        contentType: this.settings.contentType,
      });

      // Create a ReadableStream that parses SSE and emits LanguageModelV3StreamPart
      const self = this;
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("Response body is not readable");
      }

      const outputStream = new ReadableStream<LanguageModelV3StreamPart>({
        async start(controller) {
          // Emit stream-start with empty warnings
          controller.enqueue({
            type: "stream-start",
            warnings: [],
          });

          try {
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                // Process any remaining buffer
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

              // Process complete SSE events
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? ""; // Keep incomplete line

              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6);

                  if (data === "[DONE]") {
                    continue; // Skip DONE marker
                  }

                  try {
                    const parts = self.parseSSEData(data);
                    for (const part of parts) {
                      controller.enqueue(part);
                    }
                  } catch (e) {
                    self.logger.error(
                      `[sandagent] Failed to parse SSE data: ${e}`,
                    );
                  }
                }
              }
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              self.logger.info("[sandagent] Stream aborted by user");
            } else {
              self.logger.error(`[sandagent] Stream error: ${error}`);
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
      // Clean up agent on error
      await agent.destroy().catch(() => {});
      throw error;
    }
  }

  /**
   * Parse SSE buffer into stream parts.
   */
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

  /**
   * Parse SSE data JSON into stream parts.
   */
  private parseSSEData(data: string): LanguageModelV3StreamPart[] {
    const parts: LanguageModelV3StreamPart[] = [];
    const parsed = JSON.parse(data) as Record<string, unknown>;

    switch (parsed.type) {
      case "start": {
        // Session started
        if (parsed.messageId) {
          this.setSessionId(parsed.messageId as string);
        }
        break;
      }

      case "message-metadata": {
        // Emit response metadata
        const metadata = parsed.messageMetadata as Record<string, unknown>;
        parts.push({
          type: "response-metadata",
          id: generateId(),
          modelId: (metadata?.model as string) ?? this.modelId,
          timestamp: new Date(),
        });
        break;
      }

      case "text-start": {
        parts.push({
          type: "text-start",
          id: parsed.id as string,
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
          providerExecuted: (parsed.dynamic as boolean) ?? true,
        });
        break;
      }

      case "tool-input-delta": {
        parts.push({
          type: "tool-input-delta",
          id: parsed.toolCallId as string,
          delta: parsed.delta as string,
        });
        break;
      }

      case "tool-input-end": {
        parts.push({
          type: "tool-input-end",
          id: parsed.toolCallId as string,
        });
        break;
      }

      case "tool-input-available": {
        // Legacy format - Tool input is fully available
        const toolCallId = parsed.toolCallId as string;
        const toolName = parsed.toolName as string;
        const input = parsed.input as Record<string, unknown>;

        parts.push({
          type: "tool-call",
          toolCallId,
          toolName,
          input: JSON.stringify(input),
          providerExecuted: true,
        });
        break;
      }

      case "tool-call": {
        // New format - tool-call with input already stringified
        parts.push({
          type: "tool-call",
          toolCallId: parsed.toolCallId as string,
          toolName: parsed.toolName as string,
          input: parsed.input as string,
          providerExecuted: (parsed.providerExecuted as boolean) ?? true,
        });
        break;
      }

      case "tool-result": {
        // Tool result from runner
        parts.push({
          type: "tool-result",
          toolCallId: parsed.toolCallId as string,
          toolName: (parsed.toolName as string) ?? "",
          result: parsed.result as string,
          isError: parsed.isError as boolean,
        });
        break;
      }

      case "tool-output-available": {
        // Legacy format
        const resultValue =
          typeof parsed.output === "string"
            ? parsed.output
            : JSON.stringify(parsed.output);
        parts.push({
          type: "tool-result",
          toolCallId: parsed.toolCallId as string,
          toolName: "",
          result: resultValue,
        });
        break;
      }

      case "tool-output-error": {
        // Tool error - emit as error
        parts.push({
          type: "error",
          error: new Error(parsed.errorText as string),
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
        // Handle both old format (string) and new format (object with unified/raw)
        const rawFinishReason = parsed.finishReason;
        let finishReason: LanguageModelV3FinishReason;

        if (
          typeof rawFinishReason === "object" &&
          rawFinishReason !== null &&
          "unified" in rawFinishReason
        ) {
          // New format from updated runner
          finishReason = rawFinishReason as LanguageModelV3FinishReason;
        } else {
          // Old format - map string to object
          finishReason = this.mapFinishReason(rawFinishReason as string);
        }

        // Handle both old format (in messageMetadata) and new format (direct usage)
        const rawUsage = parsed.usage ?? parsed.messageMetadata;
        const usage = this.convertUsage(
          rawUsage as Record<string, unknown> | undefined,
        );

        parts.push({
          type: "finish",
          finishReason,
          usage,
          providerMetadata: {
            sandagent: {
              sessionId: this.sessionId ?? "",
              ...(parsed.messageMetadata as Record<string, unknown>),
            },
          },
        });
        break;
      }
    }

    return parts;
  }

  /**
   * Convert AI SDK prompt to SandAgent messages.
   */
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
          // Extract text content from user message parts
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
          // Extract text content from assistant message parts
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
          // Tool results are handled by the agent internally
          break;
        }
      }
    }

    return messages;
  }

  /**
   * Map finish reason from sandbox response to AI SDK format.
   */
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

  /**
   * Convert usage from sandbox response to AI SDK format.
   * Handles both old format (usage nested in metadata) and new format (direct usage object).
   */
  private convertUsage(
    data: Record<string, unknown> | undefined,
  ): LanguageModelV3Usage {
    if (!data) {
      return createEmptyUsage();
    }

    // Check if this is the new format (direct usage with inputTokens/outputTokens)
    if ("inputTokens" in data && "outputTokens" in data) {
      const inputTokens = data.inputTokens as Record<string, number>;
      const outputTokens = data.outputTokens as Record<string, number>;

      return {
        inputTokens: {
          total: inputTokens.total ?? 0,
          noCache: inputTokens.noCache ?? 0,
          cacheRead: inputTokens.cacheRead ?? 0,
          cacheWrite: inputTokens.cacheWrite ?? 0,
        },
        outputTokens: {
          total: outputTokens.total ?? 0,
          text: undefined,
          reasoning: undefined,
        },
      };
    }

    // Check if usage is nested (old format from messageMetadata)
    const usage = (data.usage ?? data) as Record<string, number>;

    // Handle Claude SDK format (input_tokens, output_tokens, etc.)
    if ("input_tokens" in usage || "output_tokens" in usage) {
      const inputTokens = (usage.input_tokens as number) ?? 0;
      const outputTokens = (usage.output_tokens as number) ?? 0;
      const cacheWrite = (usage.cache_creation_input_tokens as number) ?? 0;
      const cacheRead = (usage.cache_read_input_tokens as number) ?? 0;

      return {
        inputTokens: {
          total: inputTokens + cacheWrite + cacheRead,
          noCache: inputTokens,
          cacheRead,
          cacheWrite,
        },
        outputTokens: {
          total: outputTokens,
          text: undefined,
          reasoning: undefined,
        },
      };
    }

    return createEmptyUsage();
  }
}
