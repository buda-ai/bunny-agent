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
  Options,
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
 * Claude Agent SDK Module interface
 * Uses the SDK's Options type directly for better compatibility
 */
interface ClaudeAgentSDKModule {
  query(params: {
    prompt: string | AsyncIterable<SDKUserMessage>;
    options?: Options;
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
        } catch (error) {
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

/** 累积的 usage 统计 */
interface AccumulatedUsage {
  inputTokens: number;
  outputTokens: number;
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
  const usage: AccumulatedUsage = { inputTokens: 0, outputTokens: 0 };
  let systemMessage: SDKSystemMessage | undefined;
  let messageId: string | undefined;

  const sdkOptions: Options = {
    model: options.model,
    systemPrompt: options.systemPrompt,
    maxTurns: options.maxTurns,
    allowedTools: [...(options.allowedTools ?? []), "Skill"],
    cwd: options.cwd,
    env: options.env,
    resume: options.resume,
    settingSources: ["project", "user"],
    canUseTool: createCanUseToolCallback(options),
    // Bypass all permission checks for automated execution
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
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

  try {
    for await (const message of queryIterator) {
      // console.log(
      //   "[ClaudeRunner] get message",
      //   JSON.stringify(message, null, 2),
      // );
      if (message.type === "system" && message.subtype === "init") {
        systemMessage = message;
        continue;
      }

      // start message
      if (message.type === "assistant" && !messageId && systemMessage) {
        messageId = (message as SDKAssistantMessage).message.id;
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
      const chunks = convertSDKMessageToAISDKUI(message);
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[ClaudeRunner] Error:", errorMessage);

    yield formatDataStream({ type: "error", errorText: errorMessage });
    yield formatDataStream({
      type: "finish",
      finishReason: "error",
      usage: {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
      },
    });
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
 * - tool-call-start/tool-call-delta/tool-call-end: Tool calls
 * - tool-result: Tool execution results
 * - error: Error messages
 * - finish-message: Message completion
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
 */
function convertSDKMessageToAISDKUI(message: SDKMessage): string[] {
  const chunks: string[] = [];
  switch (message.type) {
    case "assistant": {
      // Assistant response - can contain text and tool_use content blocks
      const assistantMsg = message as SDKAssistantMessage;

      // Check for error in the message
      if (assistantMsg.error) {
        const errorDetail = message.message.content
          .map((c: { type: string; text: string }) => c.text)
          .join("\n");
        chunks.push(
          formatDataStream({
            type: "error",
            errorText: `${assistantMsg.error}: ${errorDetail}`,
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
              chunks.push(
                formatDataStream({
                  type: "tool-input-start",
                  toolCallId,
                  toolName: block.name,
                  dynamic: true,
                }),
              );
              if (block.input) {
                chunks.push(
                  formatDataStream({
                    type: "tool-input-available",
                    toolCallId,
                    toolName: block.name,
                    dynamic: true,
                    input: block.input,
                  }),
                );
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

      // Always emit finish, with appropriate finishReason and usage in messageMetadata
      chunks.push(
        formatDataStream({
          type: "finish",
          finishReason: resultMsg.is_error ? "error" : "stop",
          messageMetadata: {
            usage: resultMsg.usage,
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
          if (tool.is_error) {
            chunks.push(
              formatDataStream({
                type: "tool-output-error",
                toolCallId: tool.tool_use_id,
                errorText: tool.content,
                dynamic: true,
              }),
            );
          } else {
            chunks.push(
              formatDataStream({
                type: "tool-output-available",
                toolCallId: tool.tool_use_id,
                output: usrMsg.tool_use_result || tool.content,
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

    // Finish message
    yield formatDataStream({
      type: "finish",
      finishReason: "stop",
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
      finishReason: "error",
    });
    yield `data: [DONE]\n\n`;
  }
}
