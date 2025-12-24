/**
 * Claude Agent SDK Runner
 *
 * This module provides a runner that uses the Claude Agent SDK
 * and outputs AI SDK UI messages.
 */

/**
 * Options for creating a Claude runner
 */
export interface ClaudeRunnerOptions {
  /** Model to use */
  model: string;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Allowed tools */
  allowedTools?: string[];
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

// Type definitions for Claude Agent SDK
interface ClaudeAgentMessage {
  type: string;
  content?: string;
  tool_use?: {
    id: string;
    name: string;
    input: unknown;
  };
  tool_result?: {
    tool_use_id: string;
    content: string;
  };
}

interface ClaudeAgent {
  run(options: {
    prompt: string;
    maxTurns?: number;
    allowedTools?: string[];
  }): AsyncIterable<ClaudeAgentMessage>;
}

interface ClaudeAgentSDK {
  createAgent(options: { model: string; systemPrompt?: string }): ClaudeAgent;
}

/**
 * Create a Claude runner
 */
export function createClaudeRunner(options: ClaudeRunnerOptions): ClaudeRunner {
  return {
    async *run(userInput: string): AsyncIterable<string> {
      // Try to load the Claude Agent SDK
      const sdk = await loadClaudeAgentSDK();

      if (sdk) {
        // Use the real Claude Agent SDK
        yield* runWithClaudeSDK(sdk, options, userInput);
      } else {
        // Fallback to mock implementation for development
        yield* runMockAgent(options, userInput);
      }
    },
  };
}

async function loadClaudeAgentSDK(): Promise<ClaudeAgentSDK | null> {
  try {
    // Use dynamic import with a variable to avoid TypeScript static analysis
    const moduleName = "@anthropic-ai/claude-code";
    const module = await (Function('moduleName', 'return import(moduleName)')(moduleName) as Promise<unknown>);
    return module as ClaudeAgentSDK;
  } catch {
    // SDK not installed, return null
    return null;
  }
}

async function* runWithClaudeSDK(
  sdk: ClaudeAgentSDK,
  options: ClaudeRunnerOptions,
  userInput: string
): AsyncIterable<string> {
  const agent = sdk.createAgent({
    model: options.model,
    systemPrompt: options.systemPrompt,
  });

  for await (const message of agent.run({
    prompt: userInput,
    maxTurns: options.maxTurns,
    allowedTools: options.allowedTools,
  })) {
    // Convert Claude Agent messages to AI SDK UI format
    yield convertToAISDKUIMessage(message);
  }
}

/**
 * Convert a Claude Agent message to AI SDK UI format
 */
function convertToAISDKUIMessage(message: ClaudeAgentMessage): string {
  // AI SDK UI uses a specific format for streaming messages
  // This is a simplified implementation - the real format depends on AI SDK version
  const chunk = formatAISDKUIChunk(message);
  return chunk;
}

function formatAISDKUIChunk(message: ClaudeAgentMessage): string {
  // AI SDK UI streaming format uses data: prefixed lines
  // Each message is a JSON object prefixed with data:

  if (message.type === "text" && message.content) {
    return `0:${JSON.stringify(message.content)}\n`;
  }

  if (message.type === "tool_use" && message.tool_use) {
    return `9:${JSON.stringify({
      toolCallId: message.tool_use.id,
      toolName: message.tool_use.name,
      args: message.tool_use.input,
    })}\n`;
  }

  if (message.type === "tool_result" && message.tool_result) {
    return `a:${JSON.stringify({
      toolCallId: message.tool_result.tool_use_id,
      result: message.tool_result.content,
    })}\n`;
  }

  // Default: output as-is
  return `0:${JSON.stringify(JSON.stringify(message))}\n`;
}

/**
 * Mock implementation for development without Claude Agent SDK
 */
async function* runMockAgent(
  options: ClaudeRunnerOptions,
  userInput: string
): AsyncIterable<string> {
  // Output a simple response in AI SDK UI format
  const response = `I received your request: "${userInput}". Model: ${options.model}. This is a mock response - install @anthropic-ai/claude-code for the real agent.`;

  // Simulate streaming by yielding characters
  for (const char of response) {
    yield `0:${JSON.stringify(char)}\n`;
    // Small delay to simulate streaming
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // End of message
  yield `d:{"finishReason":"stop"}\n`;
}
