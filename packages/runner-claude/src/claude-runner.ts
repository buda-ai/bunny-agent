/**
 * Claude Agent SDK Runner
 *
 * This module provides a runner that uses the Anthropic Claude SDK
 * and outputs AI SDK UI messages for streaming.
 *
 * The runner uses @anthropic-ai/sdk for real Claude API access.
 * When the SDK is not installed, it falls back to a mock implementation
 * for development purposes.
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
}

/**
 * A runner that executes tasks using Claude API
 */
export interface ClaudeRunner {
  /**
   * Run a task and stream AI SDK UI messages
   * @param userInput - The user's task/input
   * @returns An async iterable of AI SDK UI message chunks
   */
  run(userInput: string): AsyncIterable<string>;
}

// Type definitions for Anthropic SDK
interface MessageStreamEvent {
  type: string;
  index?: number;
  message?: {
    id: string;
    type: string;
    role: string;
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };
  content_block?: ContentBlock;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
}

interface ContentBlock {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface MessageStream {
  [Symbol.asyncIterator](): AsyncIterator<MessageStreamEvent>;
}

interface AnthropicClient {
  messages: {
    stream(params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: Array<{ role: string; content: string }>;
      tools?: Array<{
        name: string;
        description: string;
        input_schema: { type: string; properties: Record<string, unknown>; required?: string[] };
      }>;
    }): MessageStream;
  };
}

interface AnthropicModule {
  default: new (options: { apiKey?: string }) => AnthropicClient;
}

// Module registry for optional dependencies
const OPTIONAL_MODULES: Record<string, string> = {
  "anthropic-sdk": "@anthropic-ai/sdk",
};

/**
 * Create a Claude runner
 */
export function createClaudeRunner(options: ClaudeRunnerOptions): ClaudeRunner {
  return {
    async *run(userInput: string): AsyncIterable<string> {
      // Check for API key
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error(
          "Warning: ANTHROPIC_API_KEY not set. Using mock response."
        );
        yield* runMockAgent(options, userInput);
        return;
      }

      // Try to load the Anthropic SDK
      const sdk = await loadAnthropicSDK();

      if (sdk) {
        // Use the real Anthropic SDK
        yield* runWithAnthropicSDK(sdk, options, userInput, apiKey);
      } else {
        // Fallback to mock implementation for development
        console.error(
          "Warning: @anthropic-ai/sdk not installed. Using mock response."
        );
        yield* runMockAgent(options, userInput);
      }
    },
  };
}

async function loadAnthropicSDK(): Promise<AnthropicModule | null> {
  try {
    // Use a registry pattern for safer dynamic imports
    const modulePath = OPTIONAL_MODULES["anthropic-sdk"];
    // Dynamic import is safe here as the module path comes from a fixed registry
    const module = await import(/* webpackIgnore: true */ modulePath);
    return module as AnthropicModule;
  } catch {
    // SDK not installed, return null
    return null;
  }
}

/**
 * Define available tools for the agent
 */
const AVAILABLE_TOOLS = [
  {
    name: "bash",
    description: "Execute a bash command in the sandbox environment",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "The file path to write to",
        },
        content: {
          type: "string",
          description: "The content to write",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "read_file",
    description: "Read content from a file",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "The file path to read",
        },
      },
      required: ["path"],
    },
  },
];

/**
 * Get filtered tools based on allowed tools list
 */
function getFilteredTools(allowedTools?: string[]) {
  if (!allowedTools || allowedTools.length === 0) {
    return AVAILABLE_TOOLS;
  }
  return AVAILABLE_TOOLS.filter((tool) => allowedTools.includes(tool.name));
}

/**
 * Run with real Anthropic SDK
 */
async function* runWithAnthropicSDK(
  sdk: AnthropicModule,
  options: ClaudeRunnerOptions,
  userInput: string,
  apiKey: string
): AsyncIterable<string> {
  const Anthropic = sdk.default;
  const client = new Anthropic({ apiKey });

  const tools = getFilteredTools(options.allowedTools);
  const systemPrompt =
    options.systemPrompt ??
    "You are a helpful AI assistant. You can execute commands, read and write files to complete tasks.";

  try {
    const stream = client.messages.stream({
      model: options.model,
      max_tokens: 8096,
      system: systemPrompt,
      messages: [{ role: "user", content: userInput }],
      tools: tools.length > 0 ? tools : undefined,
    });

    let currentToolCallId: string | undefined;
    let currentToolName: string | undefined;
    let toolInputBuffer = "";

    for await (const event of stream) {
      // Convert Anthropic stream events to AI SDK UI format
      const chunks = convertEventToAISDKUI(
        event,
        currentToolCallId,
        currentToolName,
        toolInputBuffer
      );

      // Update state based on event
      if (event.type === "content_block_start" && event.content_block) {
        if (event.content_block.type === "tool_use") {
          currentToolCallId = event.content_block.id;
          currentToolName = event.content_block.name;
          toolInputBuffer = "";
        }
      }

      if (event.type === "content_block_delta" && event.delta) {
        if (event.delta.partial_json) {
          toolInputBuffer += event.delta.partial_json;
        }
      }

      if (event.type === "content_block_stop") {
        currentToolCallId = undefined;
        currentToolName = undefined;
        toolInputBuffer = "";
      }

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
 * Convert Anthropic stream event to AI SDK UI format
 */
function convertEventToAISDKUI(
  event: MessageStreamEvent,
  currentToolCallId?: string,
  currentToolName?: string,
  toolInputBuffer?: string
): string[] {
  const chunks: string[] = [];

  switch (event.type) {
    case "message_start":
      // Start of message - no output needed
      break;

    case "content_block_start":
      if (event.content_block?.type === "text") {
        // Text block starting - no output needed
      } else if (event.content_block?.type === "tool_use") {
        // Tool call starting
        // Will be emitted when we have the full input
      }
      break;

    case "content_block_delta":
      if (event.delta?.type === "text_delta" && event.delta.text) {
        // Text content - stream as AI SDK text chunk (type 0)
        chunks.push(`0:${JSON.stringify(event.delta.text)}\n`);
      } else if (event.delta?.type === "input_json_delta") {
        // Tool input being streamed - will be combined and emitted at block end
      }
      break;

    case "content_block_stop":
      // If we were building a tool call, emit it now
      if (currentToolCallId && currentToolName && toolInputBuffer) {
        try {
          const input = JSON.parse(toolInputBuffer);
          chunks.push(
            `9:${JSON.stringify({
              toolCallId: currentToolCallId,
              toolName: currentToolName,
              args: input,
            })}\n`
          );
        } catch {
          // Invalid JSON input - skip tool call
        }
      }
      break;

    case "message_stop":
      // Message complete - finish message will be sent separately
      break;

    case "message_delta":
      // Message metadata update - no output needed
      break;
  }

  return chunks;
}

/**
 * Mock implementation for development without Anthropic SDK or API key
 *
 * This provides a simple response for testing the streaming infrastructure
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
    `- @anthropic-ai/sdk is not installed\n\n` +
    `To use the real Claude API:\n` +
    `1. Set ANTHROPIC_API_KEY environment variable\n` +
    `2. Install the SDK: npm install @anthropic-ai/sdk`;

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
