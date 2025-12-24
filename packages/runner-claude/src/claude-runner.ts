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
interface SDKMessage {
  type: string;
  subtype?: string;
  [key: string]: unknown;
}

interface SDKResultMessage extends SDKMessage {
  type: "result";
  subtype: "success" | "error" | "interrupted";
  is_error?: boolean;
  duration_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  permission_denials?: number;
  errors?: string[];
  structured_output?: unknown;
}

interface SDKAssistantMessage extends SDKMessage {
  type: "assistant";
  message: string;
}

interface SDKToolUseMessage extends SDKMessage {
  type: "tool_use";
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
}

interface SDKToolResultMessage extends SDKMessage {
  type: "tool_result";
  tool_use_id: string;
  output: string;
  is_error?: boolean;
}

interface ClaudeAgentSDKOptions {
  model?: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

interface ClaudeAgentSDKModule {
  query(params: {
    prompt: string;
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
      // Check for API key
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error(
          "[SandAgent] Warning: ANTHROPIC_API_KEY not set. Using mock response.\n" +
            "To use the real Claude Agent SDK:\n" +
            "1. Set ANTHROPIC_API_KEY environment variable\n" +
            "2. Install the SDK: npm install @anthropic-ai/claude-agent-sdk"
        );
        yield* runMockAgent(options, userInput);
        return;
      }

      // Try to load the Claude Agent SDK
      const sdk = await loadClaudeAgentSDK();

      if (sdk) {
        // Use the real Claude Agent SDK
        yield* runWithClaudeAgentSDK(sdk, options, userInput);
      } else {
        // Fallback to mock implementation
        console.error(
          "[SandAgent] Warning: @anthropic-ai/claude-agent-sdk not installed. Using mock response.\n" +
            "Install the SDK: npm install @anthropic-ai/claude-agent-sdk"
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
  userInput: string
): AsyncIterable<string> {
  const sdkOptions: ClaudeAgentSDKOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt,
    maxTurns: options.maxTurns,
    allowedTools: options.allowedTools,
    cwd: options.cwd,
    env: options.env,
  };

  try {
    for await (const message of sdk.query({
      prompt: userInput,
      options: sdkOptions,
    })) {
      // Convert SDK messages to AI SDK UI format
      const chunks = convertSDKMessageToAISDKUI(message);
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    // Send finish message
    yield `d:{"finishReason":"stop"}\n`;
  } catch (error) {
    // Stream error as AI SDK UI format
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    yield `3:${JSON.stringify(errorMessage)}\n`;
    yield `d:{"finishReason":"error"}\n`;
  }
}

/**
 * Convert Claude Agent SDK message to AI SDK UI format
 *
 * AI SDK UI message types:
 * - 0: text content
 * - 3: error
 * - 9: tool call
 * - a: tool result
 * - d: finish
 */
function convertSDKMessageToAISDKUI(message: SDKMessage): string[] {
  const chunks: string[] = [];

  switch (message.type) {
    case "system":
      // System initialization messages - emit as text for visibility
      if (message.subtype === "init") {
        chunks.push(
          `0:${JSON.stringify(`[System initialized: ${message.model ?? "unknown model"}]\n`)}\n`
        );
      }
      break;

    case "assistant":
      // Assistant text response
      const assistantMsg = message as SDKAssistantMessage;
      if (assistantMsg.message) {
        chunks.push(`0:${JSON.stringify(assistantMsg.message)}\n`);
      }
      break;

    case "tool_use":
      // Tool call
      const toolUseMsg = message as SDKToolUseMessage;
      chunks.push(
        `9:${JSON.stringify({
          toolCallId: toolUseMsg.tool_use_id,
          toolName: toolUseMsg.tool_name,
          args: toolUseMsg.tool_input,
        })}\n`
      );
      break;

    case "tool_result":
      // Tool result
      const toolResultMsg = message as SDKToolResultMessage;
      chunks.push(
        `a:${JSON.stringify({
          toolCallId: toolResultMsg.tool_use_id,
          result: toolResultMsg.output,
        })}\n`
      );
      break;

    case "result":
      // Result message - indicates completion
      const resultMsg = message as SDKResultMessage;
      if (resultMsg.is_error && resultMsg.errors) {
        chunks.push(`3:${JSON.stringify(resultMsg.errors.join(", "))}\n`);
      }
      break;

    default:
      // Other message types (user, thinking, etc.) - skip for now
      break;
  }

  return chunks;
}

/**
 * Mock implementation for development without Claude Agent SDK or API key
 *
 * This provides a helpful response for testing the streaming infrastructure
 * without needing actual API access.
 */
async function* runMockAgent(
  options: ClaudeRunnerOptions,
  userInput: string
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

  // Simulate streaming by yielding chunks
  const words = response.split(" ");
  for (const word of words) {
    yield `0:${JSON.stringify(word + " ")}\n`;
    // Small delay to simulate streaming
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  // End of message
  yield `d:{"finishReason":"stop"}\n`;
}
