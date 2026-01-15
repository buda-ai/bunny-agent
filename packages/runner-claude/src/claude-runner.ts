/**
 * Claude Agent SDK Runner
 *
 * This module provides a runner that uses the official Claude Agent SDK
 * (@anthropic-ai/claude-agent-sdk) and outputs AI SDK UI messages for streaming.
 *
 * The Claude Agent SDK provides a high-level interface for building AI agents
 * with Claude Code's capabilities, including file operations, command execution,
 * and more.
 *
 * @see https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview
 */

import type {
  CanUseTool,
  PermissionUpdate,
  Query,
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * Options for creating a Claude runner
 */
export interface ClaudeRunnerOptions {
  /** Model to use (e.g., "claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022") */
  model: string;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Allowed tools */
  allowedTools?: string[];
  /** Working directory for the agent */
  cwd?: string;
  /** Environment variables to pass to the agent */
  env?: Record<string, string>;
  /** Resume session ID for multi-turn conversation */
  resume?: string;
  /** Approval file directory for tool approval flow (e.g., "/sandagent/approvals") */
  approvalDir?: string;
  /** AbortSignal for cancelling operations */
  signal?: AbortSignal;
}

/**
 * Build a regular user message (not a tool result)
 */
export function buildUserMessage(userInput: string): SDKUserMessage {
  return {
    type: "user",
    message: {
      role: "user",
      content: userInput,
    },
  } as SDKUserMessage;
}

/**
 * Build an AsyncIterable<SDKUserMessage> from options
 */
export async function* buildSDKUserMessageIterable(
  userInput: string,
): AsyncIterable<SDKUserMessage> {
  yield buildUserMessage(userInput);
}

/**
 * A runner that executes tasks using Claude Agent SDK
 */
export interface ClaudeRunner {
  /**
   * Run a task and stream AI SDK UI messages
   * @param userInput - The user's task/input
   * @param signal - Optional AbortSignal for cancelling the operation
   * @returns An async iterable of AI SDK UI message chunks
   */
  run(userInput: string, signal?: AbortSignal): AsyncIterable<string>;
}

/**
 * Type definitions for Claude Agent SDK
 * Based on @anthropic-ai/claude-agent-sdk
 */
enum SettingSource {
  user = "user",
  project = "project",
}

interface ClaudeAgentSDKOptions {
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  cwd?: string;
  env?: Record<string, string>;
  resume?: string;
  settingSources?: SettingSource[];
  canUseTool?: CanUseTool;
  // Permission mode: 'default', 'acceptEdits', 'bypassPermissions', 'plan'
  permissionMode?: string;
  // Required when using permissionMode: 'bypassPermissions'
  allowDangerouslySkipPermissions?: boolean;
  // Include partial messages for streaming
  includePartialMessages?: boolean;
}

interface ClaudeAgentSDKModule {
  query(params: {
    prompt: string | AsyncIterable<SDKUserMessage>;
    options?: ClaudeAgentSDKOptions;
  }): Query;
}

/**
 * Create canUseTool callback for tool approval flow
 * @param claudeOptions - Claude runner options
 * @returns canUseTool callback function
 */
function createCanUseToolCallback(
  claudeOptions: ClaudeRunnerOptions,
): CanUseTool {
  return async (
    toolName: string,
    input: unknown,
    options: {
      signal: AbortSignal;
      suggestions?: PermissionUpdate[];
      blockedPath?: string;
      decisionReason?: string;
      toolUseID: string;
      agentID?: string;
    },
  ) => {
    const { toolUseID } = options;

    // Only intercept AskUserQuestion tool
    if (toolName !== "AskUserQuestion") {
      return {
        behavior: "allow",
        updatedInput: input as Record<string, unknown>,
      };
    }

    const approvalDir = claudeOptions.approvalDir;

    // If no approval directory configured, deny the tool call
    if (!approvalDir) {
      return { behavior: "deny", message: "User not answer" };
    }

    try {
      const { execSync } = await import("node:child_process");
      const path = await import("node:path");

      const approvalFile = path.join(approvalDir, `${toolUseID}.json`);

      // Poll for answers (60 second timeout)
      const timeout = Date.now() + 60000;
      let lastApproval: {
        questions: unknown;
        answers: Record<string, unknown>;
        status: string;
      } | null = null;

      while (Date.now() < timeout) {
        try {
          // Use shell command to check if file exists and read it
          // Redirect stderr to /dev/null to suppress "No such file or directory" errors
          const data = execSync(`cat ${approvalFile} 2>/dev/null`, {
            encoding: "utf-8",
          });
          const approval = JSON.parse(data);
          lastApproval = approval;

          // If completed, return immediately
          if (approval.status === "completed") {
            // Clean up file
            try {
              execSync(`rm ${approvalFile} 2>/dev/null`);
            } catch {
              // Ignore cleanup errors
            }

            return {
              behavior: "allow",
              updatedInput: {
                questions: approval.questions,
                answers: approval.answers,
              },
            };
          }
        } catch {
          // File doesn't exist yet or can't be read, continue waiting
        }

        // Wait 500ms before next poll
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Timeout - return partial answers if any were collected
      try {
        execSync(`rm ${approvalFile} 2>/dev/null`);
      } catch {
        // Ignore cleanup errors
      }

      if (lastApproval && Object.keys(lastApproval.answers).length > 0) {
        // Return partial answers
        return {
          behavior: "allow",
          updatedInput: {
            questions: lastApproval.questions,
            answers: lastApproval.answers,
          },
        };
      }
      return {
        behavior: "deny",
        message: "Timeout waiting for user input",
      };
    } catch (error) {
      console.error("Failed to handle approval flow:", error);
      return {
        behavior: "deny",
        message: "Failed to handle approval flow",
      };
    }
  };
}

/**
 * Usage data from Claude Agent SDK
 */
interface ClaudeCodeUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Converts Claude Agent SDK usage to AI SDK usage format
 */
function convertUsageToAISDK(usage?: ClaudeCodeUsage): {
  inputTokens: {
    total: number;
    noCache: number;
    cacheRead: number;
    cacheWrite: number;
  };
  outputTokens: {
    total: number;
    text?: number;
    reasoning?: number;
  };
  raw?: ClaudeCodeUsage;
} {
  if (!usage) {
    return {
      inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 0 },
    };
  }

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  return {
    inputTokens: {
      total: inputTokens + cacheWrite + cacheRead,
      noCache: inputTokens,
      cacheRead,
      cacheWrite,
    },
    outputTokens: {
      total: outputTokens,
    },
    raw: usage,
  };
}

/**
 * Maps Claude Agent SDK result subtypes to AI SDK finish reasons
 */
function mapFinishReason(
  subtype?: string,
  isError?: boolean,
): {
  unified:
    | "stop"
    | "length"
    | "content-filter"
    | "tool-calls"
    | "error"
    | "other";
  raw: string | undefined;
} {
  // If explicitly marked as error
  if (isError) {
    return { unified: "error", raw: subtype ?? "error" };
  }

  switch (subtype) {
    case "success":
      return { unified: "stop", raw: subtype };
    case "error_max_turns":
      return { unified: "length", raw: subtype };
    case "error_during_execution":
      return { unified: "error", raw: subtype };
    case "error_max_structured_output_retries":
      return { unified: "error", raw: subtype };
    case undefined:
      return { unified: "stop", raw: undefined };
    default:
      // Unknown subtypes mapped to 'other'
      return { unified: "other", raw: subtype };
  }
}

/**
 * Check if an error is an AbortError
 */
function isAbortError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { name?: unknown; code?: unknown };
    if (typeof e.name === "string" && e.name === "AbortError") return true;
    if (typeof e.code === "string" && e.code.toUpperCase() === "ABORT_ERR")
      return true;
  }
  return false;
}

const MIN_TRUNCATION_LENGTH = 512;

/**
 * Detects if an error represents a truncated SDK JSON stream.
 *
 * The Claude Code SDK can truncate JSON responses mid-stream, producing a SyntaxError.
 * This function distinguishes genuine truncation from normal JSON syntax errors.
 */
function isClaudeCodeTruncationError(
  error: unknown,
  bufferedText: string,
): boolean {
  const isSyntaxError =
    error instanceof SyntaxError ||
    (typeof (error as { name?: string })?.name === "string" &&
      (error as { name: string }).name.toLowerCase() === "syntaxerror");

  if (!isSyntaxError) {
    return false;
  }

  if (!bufferedText) {
    return false;
  }

  const rawMessage =
    typeof (error as { message?: string })?.message === "string"
      ? (error as { message: string }).message
      : "";
  const message = rawMessage.toLowerCase();

  const truncationIndicators = [
    "unexpected end of json input",
    "unexpected end of input",
    "unexpected end of string",
    "unexpected eof",
    "end of file",
    "unterminated string",
    "unterminated string constant",
  ];

  if (!truncationIndicators.some((indicator) => message.includes(indicator))) {
    return false;
  }

  if (bufferedText.length < MIN_TRUNCATION_LENGTH) {
    return false;
  }

  return true;
}

/**
 * Tracks the streaming lifecycle state for a single tool invocation.
 */
interface ToolStreamState {
  name: string;
  lastSerializedInput?: string;
  inputStarted: boolean;
  inputClosed: boolean;
  callEmitted: boolean;
}

// Module registry for optional dependencies
const OPTIONAL_MODULES: Record<string, string> = {
  "claude-agent-sdk": "@anthropic-ai/claude-agent-sdk",
};

/**
 * Create a Claude runner using the official Claude Agent SDK
 */
export function createClaudeRunner(options: ClaudeRunnerOptions): ClaudeRunner {
  return {
    async *run(userInput: string, signal?: AbortSignal): AsyncIterable<string> {
      // Check if signal is already aborted - just return without sending messages
      if (signal?.aborted) {
        return;
      }

      // Check for API key
      const apiKey =
        process.env.ANTHROPIC_API_KEY || process.env.AWS_BEARER_TOKEN_BEDROCK;
      if (!apiKey) {
        console.error(
          "[SandAgent] Warning: ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK not set. Using mock response.\n" +
            "To use the real Claude Agent SDK:\n" +
            "1. Set ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK environment variable\n" +
            "2. Install the SDK: npm install @anthropic-ai/claude-agent-sdk",
        );

        yield* runMockAgent(options, userInput, signal);
        return;
      }

      // Try to load the Claude Agent SDK
      const sdk = await loadClaudeAgentSDK();

      if (sdk) {
        // Use the real Claude Agent SDK
        yield* runWithClaudeAgentSDK(sdk, options, userInput, signal);
      } else {
        // Fallback to mock implementation
        console.error(
          "[SandAgent] Warning: @anthropic-ai/claude-agent-sdk not installed. Using mock response.\n" +
            "Install the SDK: npm install @anthropic-ai/claude-agent-sdk",
        );
        yield* runMockAgent(options, userInput, signal);
      }
    },
  };
}

/**
 * Load the Claude Agent SDK dynamically
 */
async function loadClaudeAgentSDK(): Promise<ClaudeAgentSDKModule | null> {
  try {
    const modulePath = OPTIONAL_MODULES["claude-agent-sdk"];
    const module = await import(/* webpackIgnore: true */ modulePath);
    return module as ClaudeAgentSDKModule;
  } catch {
    return null;
  }
}

/**
 * Run with real Claude Agent SDK
 */
async function* runWithClaudeAgentSDK(
  sdk: ClaudeAgentSDKModule,
  options: ClaudeRunnerOptions,
  userInput: string | AsyncIterable<SDKUserMessage>,
  signal?: AbortSignal,
): AsyncIterable<string> {
  let systemMessage: SDKSystemMessage | undefined;
  let messageId: string | undefined;
  let hasEmittedStart = false;
  let accumulatedText = "";

  // Tool state tracking for proper streaming lifecycle
  const toolStates = new Map<string, ToolStreamState>();

  const sdkOptions: ClaudeAgentSDKOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt,
    maxTurns: options.maxTurns,
    allowedTools: [...(options.allowedTools ?? []), "Skill"],
    cwd: options.cwd,
    env: options.env,
    resume: options.resume,
    settingSources: [SettingSource.project, SettingSource.user],
    canUseTool: createCanUseToolCallback(options),
    // Bypass all permission checks for automated execution
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    // Enable partial messages for streaming
    includePartialMessages: true,
  };

  const queryIterator = sdk.query({
    prompt: userInput,
    options: sdkOptions,
  });

  // Add abort event listener to call interrupt() on the query
  const abortHandler = async () => {
    console.error(
      "[ClaudeRunner] Operation aborted, calling query.interrupt()",
    );
    await queryIterator.interrupt();
  };

  if (signal) {
    console.error("[ClaudeRunner] Signal provided, adding abort listener");
    signal.addEventListener("abort", abortHandler);

    // Check if already aborted
    if (signal.aborted) {
      console.error("[ClaudeRunner] Signal already aborted!");
    }
  } else {
    console.error("[ClaudeRunner] No signal provided");
  }

  /**
   * Helper to close tool input stream
   */
  function closeToolInput(
    toolId: string,
    state: ToolStreamState,
    chunks: string[],
  ): void {
    if (!state.inputClosed && state.inputStarted) {
      chunks.push(
        formatDataStream({
          type: "tool-input-end",
          toolCallId: toolId,
        }),
      );
      state.inputClosed = true;
    }
  }

  /**
   * Finalize all pending tool calls at end of stream
   */
  function finalizeToolCalls(chunks: string[]): void {
    for (const [toolId, state] of toolStates) {
      closeToolInput(toolId, state, chunks);
    }
    toolStates.clear();
  }

  try {
    for await (const message of queryIterator) {
      // Handle system init message
      if (message.type === "system" && message.subtype === "init") {
        systemMessage = message;
        continue;
      }

      // Emit start message on first assistant message
      if (message.type === "assistant" && !hasEmittedStart && systemMessage) {
        const assistantMsg = message as SDKAssistantMessage;
        messageId = assistantMsg.message?.id ?? generateId();
        hasEmittedStart = true;

        yield formatDataStream({
          type: "start",
          messageId,
        });

        yield formatDataStream({
          type: "message-metadata",
          messageMetadata: {
            tools: systemMessage.tools,
            model: systemMessage.model,
            sessionId: systemMessage.session_id,
          },
        });
      }

      // Convert and output messages
      const chunks = convertSDKMessageToAISDKUI(
        message,
        toolStates,
        accumulatedText,
      );

      // Track accumulated text for truncation detection
      if (message.type === "assistant") {
        const assistantMsg = message as SDKAssistantMessage;
        if (assistantMsg.message?.content) {
          for (const block of assistantMsg.message.content) {
            if (block.type === "text" && block.text) {
              accumulatedText += block.text;
            }
          }
        }
      }

      for (const chunk of chunks) {
        yield chunk;
      }
    }

    // Finalize any pending tool calls
    const finalChunks: string[] = [];
    finalizeToolCalls(finalChunks);
    for (const chunk of finalChunks) {
      yield chunk;
    }
  } catch (error) {
    // Check for truncation error
    if (isClaudeCodeTruncationError(error, accumulatedText)) {
      console.warn(
        `[ClaudeRunner] Detected truncated stream response, returning ${accumulatedText.length} characters of buffered text`,
      );

      // Finalize tool calls
      const finalChunks: string[] = [];
      finalizeToolCalls(finalChunks);
      for (const chunk of finalChunks) {
        yield chunk;
      }

      yield formatDataStream({
        type: "finish",
        finishReason: { unified: "length", raw: "truncation" },
        usage: convertUsageToAISDK(undefined),
        messageMetadata: {
          truncated: true,
        },
      });
    } else if (isAbortError(error)) {
      // Handle abort gracefully
      console.log("[ClaudeRunner] Operation aborted by user");
      const finalChunks: string[] = [];
      finalizeToolCalls(finalChunks);
      for (const chunk of finalChunks) {
        yield chunk;
      }
    } else {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[ClaudeRunner] Error:", errorMessage);

      yield formatDataStream({ type: "error", errorText: errorMessage });
      yield formatDataStream({
        type: "finish",
        finishReason: mapFinishReason("error_during_execution", true),
        usage: convertUsageToAISDK(undefined),
      });
    }
  } finally {
    // Remove abort event listener
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
    yield `data: [DONE]\n\n`;
  }
}

/**
 * Convert Claude Agent SDK message to AI SDK UI format (SSE-based Data Stream Protocol)
 *
 * AI SDK UI Data Stream Protocol uses Server-Sent Events format:
 * - message-start: Beginning of a new message
 * - text-start/text-delta/text-end: Text content streaming
 * - tool-input-start/tool-input-delta/tool-input-end: Tool input streaming
 * - tool-call: Tool call with complete input
 * - tool-result: Tool execution results
 * - error: Error messages
 * - finish: Message completion
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
 */
function convertSDKMessageToAISDKUI(
  message: SDKMessage,
  toolStates: Map<string, ToolStreamState>,
  _accumulatedText: string,
): string[] {
  const chunks: string[] = [];

  switch (message.type) {
    case "assistant": {
      // Assistant response - can contain text and tool_use content blocks
      const assistantMsg = message as SDKAssistantMessage;

      // Check for error in the message
      if (assistantMsg.error) {
        const errorDetail =
          assistantMsg.message?.content
            ?.map((c: { type: string; text?: string }) => c.text ?? "")
            .filter(Boolean)
            .join("\n") ?? "";
        chunks.push(
          formatDataStream({
            type: "error",
            errorText: errorDetail
              ? `${assistantMsg.error}: ${errorDetail}`
              : assistantMsg.error,
          }),
        );
        break;
      }

      // Handle message content
      if (assistantMsg.message) {
        // If message is a string (simple text response)
        if (typeof assistantMsg.message === "string") {
          const textId = generateId();
          chunks.push(formatDataStream({ type: "text-start", id: textId }));
          chunks.push(
            formatDataStream({
              type: "text-delta",
              id: textId,
              delta: assistantMsg.message,
            }),
          );
          chunks.push(formatDataStream({ type: "text-end", id: textId }));
        }
        // If message is an object with content array
        else if (
          assistantMsg.message.content &&
          Array.isArray(assistantMsg.message.content)
        ) {
          for (const block of assistantMsg.message.content) {
            if (block.type === "text" && block.text) {
              const textId = generateId();
              chunks.push(formatDataStream({ type: "text-start", id: textId }));
              chunks.push(
                formatDataStream({
                  type: "text-delta",
                  id: textId,
                  delta: block.text,
                }),
              );
              chunks.push(formatDataStream({ type: "text-end", id: textId }));
            } else if (block.type === "tool_use") {
              const toolCallId = block.id || generateId();
              const toolName = block.name || "unknown-tool";

              // Get or create tool state
              let state = toolStates.get(toolCallId);
              if (!state) {
                state = {
                  name: toolName,
                  inputStarted: false,
                  inputClosed: false,
                  callEmitted: false,
                };
                toolStates.set(toolCallId, state);
              }

              // Emit tool-input-start if not started
              if (!state.inputStarted) {
                chunks.push(
                  formatDataStream({
                    type: "tool-input-start",
                    toolCallId,
                    toolName,
                    dynamic: true,
                    providerExecuted: true,
                  }),
                );
                state.inputStarted = true;
              }

              if (block.input && !state.callEmitted) {
                // Serialize input
                const serializedInput =
                  typeof block.input === "string"
                    ? block.input
                    : JSON.stringify(block.input);

                // Emit delta if input changed
                if (serializedInput !== state.lastSerializedInput) {
                  chunks.push(
                    formatDataStream({
                      type: "tool-input-delta",
                      toolCallId,
                      delta: serializedInput,
                    }),
                  );
                  state.lastSerializedInput = serializedInput;
                }

                // Close input and emit tool-call
                if (!state.inputClosed) {
                  chunks.push(
                    formatDataStream({
                      type: "tool-input-end",
                      toolCallId,
                    }),
                  );
                  state.inputClosed = true;
                }

                // Emit tool-call with stringified input for AI SDK V3 compatibility
                chunks.push(
                  formatDataStream({
                    type: "tool-call",
                    toolCallId,
                    toolName,
                    input: serializedInput,
                    providerExecuted: true,
                  }),
                );
                state.callEmitted = true;
              }
            }
          }
        }
      }
      break;
    }
    case "result": {
      // Result message - indicates completion
      const resultMsg = message as SDKResultMessage;

      // Handle structured output errors (SDK 0.1.45+)
      if (
        (resultMsg.subtype as string) === "error_max_structured_output_retries"
      ) {
        chunks.push(
          formatDataStream({
            type: "error",
            errorText:
              "Failed to generate valid structured output after maximum retries. " +
              "The model could not produce a response matching the required schema.",
          }),
        );
      }

      // Map finish reason properly
      const finishReason = mapFinishReason(
        resultMsg.subtype,
        resultMsg.is_error,
      );

      // Convert usage to proper format
      const usage = convertUsageToAISDK(resultMsg.usage);

      // Emit finish with proper format
      chunks.push(
        formatDataStream({
          type: "finish",
          finishReason,
          usage,
          messageMetadata: {
            sessionId: resultMsg.session_id,
            duration_ms: resultMsg.duration_ms,
            num_turns: resultMsg.num_turns,
            total_cost_usd: resultMsg.total_cost_usd,
          },
        }),
      );
      break;
    }
    case "user": {
      const usrMsg = message as SDKUserMessage;

      // Skip synthetic messages (SDK-injected skill content)
      if ((usrMsg as { isSynthetic?: boolean }).isSynthetic) {
        break;
      }
      const contentArray = usrMsg.message.content;

      // this is a tool use result
      if (
        usrMsg.tool_use_result ||
        (Array.isArray(contentArray) &&
          contentArray.some((c) => c.type === "tool_result"))
      ) {
        for (const tool of contentArray) {
          if (tool.type !== "tool_result") continue;

          const toolCallId = tool.tool_use_id;

          if (tool.is_error) {
            chunks.push(
              formatDataStream({
                type: "tool-result",
                toolCallId,
                toolName: "",
                result: tool.content ?? "Error executing tool",
                isError: true,
              }),
            );
          } else {
            // Format result properly - ensure it's a string or JSON
            const resultContent = usrMsg.tool_use_result ?? tool.content;
            const result =
              typeof resultContent === "string"
                ? resultContent
                : JSON.stringify(resultContent);

            chunks.push(
              formatDataStream({
                type: "tool-result",
                toolCallId,
                toolName: "",
                result,
                dynamic: true,
              }),
            );
          }
        }
      }
      break;
    }

    default:
      // Other message types - skip for now
      break;
  }

  return chunks;
}

/**
 * Format a message as AI SDK UI Data Stream format
 * Format: data: {json}\n\n
 */
function formatDataStream(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Generate a unique ID for message parts
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Mock implementation for development without Claude Agent SDK or API key
 *
 * This provides a helpful response for testing the streaming infrastructure
 * without needing actual API access.
 */
async function* runMockAgent(
  options: ClaudeRunnerOptions,
  userInput: string,
  signal?: AbortSignal,
): AsyncIterable<string> {
  // Check if signal is already aborted - just return without sending messages
  if (signal?.aborted) {
    console.log("[ClaudeRunner] Mock agent: Operation already aborted");
    return;
  }

  try {
    // Emit start
    const messageId = generateId();
    yield formatDataStream({
      type: "start",
      messageId,
    });

    // Output a helpful response in AI SDK UI format
    const response =
      `I received your request: "${userInput}"\n\n` +
      `Model: ${options.model}\n\n` +
      `This is a mock response because:\n` +
      `- ANTHROPIC_API_KEY is not set, OR\n` +
      `- @anthropic-ai/claude-agent-sdk is not installed\n\n` +
      `To use the real Claude Agent SDK:\n` +
      `1. Set ANTHROPIC_API_KEY environment variable\n` +
      `2. Install the SDK: npm install @anthropic-ai/claude-agent-sdk\n\n` +
      `Documentation: https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview`;

    const textId = generateId();

    // Start text block
    yield formatDataStream({ type: "text-start", id: textId });

    // Simulate streaming by yielding chunks
    const words = response.split(" ");
    for (const word of words) {
      yield formatDataStream({
        type: "text-delta",
        id: textId,
        delta: word + " ",
      });
      // Small delay to simulate streaming
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    // End text block
    yield formatDataStream({ type: "text-end", id: textId });

    // Finish message with proper format
    yield formatDataStream({
      type: "finish",
      finishReason: mapFinishReason("success"),
      usage: convertUsageToAISDK(undefined),
    });

    // Stream termination
    yield `data: [DONE]\n\n`;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[ClaudeRunner] Mock agent error:", errorMessage);
    yield formatDataStream({ type: "error", errorText: errorMessage });
    yield formatDataStream({
      type: "finish",
      finishReason: mapFinishReason("error_during_execution", true),
      usage: convertUsageToAISDK(undefined),
    });
    yield `data: [DONE]\n\n`;
  }
}
