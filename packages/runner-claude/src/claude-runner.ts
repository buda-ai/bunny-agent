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

import {
  type SDKAssistantMessage,
  type SDKMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type SDKUserMessage,
  tool,
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
  /** Parent tool use ID for tool result submission */
  parentToolUseId?: string;
}

/**
 * Build an SDKUserMessage for resuming conversation after tool approval
 *
 * @param toolOutput - JSON string containing toolCallId, result, and optional isError
 * @param parentToolUseId - Parent tool use ID for the tool result
 * @param sessionId - Session ID for resuming the conversation
 * @returns SDKUserMessage formatted for Claude Agent SDK
 * @throws Error if toolOutput JSON is invalid or missing required fields
 *
 */
export function buildSDKUserMessage(
  toolOutput: string,
  parentToolUseId: string,
  sessionId: string,
): SDKUserMessage {
  let toolResultContent: string | object = toolOutput;
  try {
    toolResultContent = JSON.parse(toolOutput);
  } catch (error) {
    // Keep as string if not valid JSON
  }
  // Build the SDKUserMessage with tool_use_result flag
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: parentToolUseId,
          content: toolResultContent,
          is_error: false,
        },
      ],
    },
    tool_use_result: true,
    parent_tool_use_id: parentToolUseId,
    session_id: sessionId,
  };
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
  options: ClaudeRunnerOptions,
): AsyncIterable<SDKUserMessage> {
  if (options.parentToolUseId && options.resume) {
    // This is a tool result submission
    yield buildSDKUserMessage(
      userInput,
      options.parentToolUseId,
      options.resume,
    );
  } else {
    // This is a regular user message
    yield buildUserMessage(userInput);
  }
}

/**
 * A runner that executes tasks using Claude Agent SDK
 */
export interface ClaudeRunner {
  /**
   * Run a task and stream AI SDK UI messages
   * @param userInput - The user's task/input
   * @returns An async iterable of AI SDK UI message chunks
   */
  run(userInput: string): AsyncIterable<string>;
}

/**
 * Type definitions for Claude Agent SDK
 * Based on @anthropic-ai/claude-agent-sdk
 */
// interface SDKMessage {
//   type: string;
//   subtype?: string;
//   [key: string]: unknown;
// }

// interface SDKResultMessage extends SDKMessage {
//   type: "result";
//   subtype: "success" | "error" | "interrupted";
//   is_error?: boolean;
//   result?: string;
//   duration_ms?: number;
//   num_turns?: number;
//   total_cost_usd?: number;
//   permission_denials?: string[];
//   errors?: string[];
//   structured_output?: unknown;
// }

interface SDKAssistantMessageContent {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface SDKAssistantMessageData {
  id: string;
  model: string;
  role: string;
  stop_reason: string;
  type: string;
  content: SDKAssistantMessageContent[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
    [key: string]: unknown;
  };
}

// interface SDKAssistantMessage extends SDKMessage {
//   type: "assistant";
//   message: SDKAssistantMessageData | string;
//   error?: string;
//   session_id?: string;
// }

// interface SDKToolUseMessage extends SDKMessage {
//   type: "tool_use";
//   tool_name: string;
//   tool_input: unknown;
//   tool_use_id: string;
// }

// interface SDKToolResultMessage extends SDKMessage {
//   type: "tool_result";
//   tool_use_id: string;
//   output: string;
//   is_error?: boolean;
// }

// interface SDKSystemMessage extends SDKMessage {
//   type: "system";
//   subtype?: string;
//   model?: string;
//   cwd?: string;
//   session_id?: string;
//   tools?: string[];
// }

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
  // file system
  settingSources?: SettingSource[];
}

interface ClaudeAgentSDKModule {
  query(params: {
    prompt: string | AsyncIterable<SDKUserMessage>;
    options?: ClaudeAgentSDKOptions;
  }): AsyncIterable<SDKMessage>;
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
    async *run(userInput: string): AsyncIterable<string> {
      // Debug: log all environment variables (redacted)
      console.error("[SandAgent] Environment check:");
      console.error(
        `  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...)` : "NOT SET"}`,
      );
      console.error(`  All env keys: ${Object.keys(process.env).join(", ")}`);

      // Check for API key
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error(
          "[SandAgent] Warning: ANTHROPIC_API_KEY not set. Using mock response.\n" +
            "To use the real Claude Agent SDK:\n" +
            "1. Set ANTHROPIC_API_KEY environment variable\n" +
            "2. Install the SDK: npm install @anthropic-ai/claude-agent-sdk",
        );

        yield* runMockAgent(options, userInput);
        return;
      }

      // Try to load the Claude Agent SDK
      const sdk = await loadClaudeAgentSDK();

      if (sdk) {
        // Build the user message iterable based on options
        const userMessageIterable = buildSDKUserMessageIterable(
          userInput,
          options,
        );
        // Use the real Claude Agent SDK
        yield* runWithClaudeAgentSDK(sdk, options, userMessageIterable);
      } else {
        // Fallback to mock implementation
        console.error(
          "[SandAgent] Warning: @anthropic-ai/claude-agent-sdk not installed. Using mock response.\n" +
            "Install the SDK: npm install @anthropic-ai/claude-agent-sdk",
        );
        yield* runMockAgent(options, userInput);
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
): AsyncIterable<string> {
  const sdkOptions: ClaudeAgentSDKOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt,
    maxTurns: options.maxTurns,
    allowedTools: options.allowedTools,
    cwd: options.cwd,
    env: options.env,
    resume: options.resume,
    // SDK uses cwd as project directory, loads CLAUDE.md and .claude/skills/*.skill.md
    settingSources: [SettingSource.project, SettingSource.user],
  };

  try {
    console.error("[SandAgent] User input:", userInput);

    const queryIterator = sdk.query({
      prompt: userInput,
      options: sdkOptions,
    });

    // console.error("[SandAgent] Query iterator created, starting iteration...");

    for await (const message of queryIterator) {
      // console.log("claude return message", JSON.stringify(message, null, 2));

      // Convert SDK messages to AI SDK UI format
      const chunks = convertSDKMessageToAISDKUI(message);
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  } catch (error) {
    // Stream error as AI SDK UI format
    // console.error("[SandAgent] SDK query error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("[SandAgent] Error message:", errorMessage);
    console.error("[SandAgent] Error stack:", errorStack);

    yield formatDataStream({ type: "error", errorText: errorMessage });
    yield formatDataStream({
      type: "finish-message",
      finishReason: "error",
      usage: { promptTokens: 0, completionTokens: 0 },
    });
  } finally {
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
    case "system": {
      // System initialization messages - emit start
      const sysMsg = message as SDKSystemMessage;
      if (sysMsg.subtype === "init") {
        chunks.push(
          formatDataStream({
            type: "start",
            messageId: "msg_" + generateId(),
          }),
        );
        chunks.push(
          formatDataStream({
            type: "message-metadata",
            messageMetadata: {
              tools: sysMsg.tools,
              model: sysMsg.model,
              sessionId: sysMsg.session_id,
            },
          }),
        );
      }
      break;
    }

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

    // case "tool_use": {
    //   // Standalone tool call message
    //   const toolUseMsg = message as SDKToolUseMessage;
    //   const toolCallId = toolUseMsg.tool_use_id || generateId();

    //   chunks.push(formatDataStream({
    //     type: "tool-call-start",
    //     id: toolCallId,
    //     name: toolUseMsg.tool_name,
    //   }));
    //   if (toolUseMsg.tool_input) {
    //     chunks.push(formatDataStream({
    //       type: "tool-call-delta",
    //       id: toolCallId,
    //       delta: JSON.stringify(toolUseMsg.tool_input),
    //     }));
    //   }
    //   chunks.push(formatDataStream({
    //     type: "tool-call-end",
    //     id: toolCallId,
    //   }));
    //   break;
    // }

    // case "tool_result": {
    //   // Tool result
    //   const toolResultMsg = message as SDKToolResultMessage;
    //   chunks.push(formatDataStream({
    //     type: "tool-result",
    //     id: toolResultMsg.tool_use_id,
    //     result: toolResultMsg.output,
    //     isError: toolResultMsg.is_error ?? false,
    //   }));
    //   break;
    // }

    case "result": {
      // console.log("result message", JSON.stringify(message, null, 2));
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
      // this is a tool use result
      if (usrMsg.tool_use_result) {
        const toolResult = usrMsg.message.content;
        if (Array.isArray(toolResult)) {
          for (const tool of toolResult) {
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
                  output: tool.content,
                  dynamic: true,
                }),
              );
            }
          }
        }
      }
      break;
    }

    default:
      // Other message types (user, thinking, etc.) - skip for now
      console.error(
        `[SandAgent] Unhandled message type: ${message.type}`,
        message,
      );
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
): AsyncIterable<string> {
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
}
