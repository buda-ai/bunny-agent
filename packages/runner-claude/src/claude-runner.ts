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
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  AISDKStreamConverter,
  convertUsageToAISDK,
  formatDataStream,
  generateId,
  mapFinishReason,
  streamSDKMessagesToAISDKUI,
} from "./ai-sdk-stream.js";
import type { BaseRunnerOptions } from "./types";

/**
 * Options for creating a Claude runner
 * Extends BaseRunnerOptions with internal runtime options
 */
export interface ClaudeRunnerOptions extends BaseRunnerOptions {
  /** Working directory for the agent */
  cwd?: string;
  /** Environment variables to pass to the agent */
  env?: Record<string, string>;
  /** Include partial messages for streaming */
  includePartialMessages?: boolean;
  /** AbortController for cancelling operations */
  abortController?: AbortController;
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
  run(userInput: string): AsyncIterable<string>;
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
 * Uses default path: {cwd}/.sandagent/approvals/{toolUseID}.json
 *
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

    // Build approval file path: {cwd}/.sandagent/approvals/{toolUseID}.json
    const cwd = claudeOptions.cwd || process.cwd();

    try {
      const { execSync } = await import("node:child_process");
      const path = await import("node:path");

      const approvalDir = path.join(cwd, ".sandagent", "approvals");
      const approvalFile = path.join(approvalDir, `${toolUseID}.json`);

      // Ensure approval directory exists
      execSync(`mkdir -p "${approvalDir}"`);

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
          const data = execSync(`cat "${approvalFile}" 2>/dev/null`, {
            encoding: "utf-8",
          });
          const approval = JSON.parse(data);
          lastApproval = approval;

          // If completed, return immediately
          if (approval.status === "completed") {
            // Clean up file
            try {
              execSync(`rm "${approvalFile}" 2>/dev/null`);
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
        execSync(`rm "${approvalFile}" 2>/dev/null`);
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
      const apiKey =
        process.env.ANTHROPIC_API_KEY || process.env.AWS_BEARER_TOKEN_BEDROCK;
      if (!apiKey) {
        console.error(
          "[SandAgent] Warning: ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK not set. Using mock response.\n" +
            "To use the real Claude Agent SDK:\n" +
            "1. Set ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK environment variable\n" +
            "2. Install the SDK: npm install @anthropic-ai/claude-agent-sdk",
        );

        yield* runMockAgent(
          options,
          userInput,
          options.abortController?.signal,
        );
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
            "Install the SDK: npm install @anthropic-ai/claude-agent-sdk",
        );
        yield* runMockAgent(
          options,
          userInput,
          options.abortController?.signal,
        );
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
 * Dispatches to different output format handlers based on options.outputFormat
 */
async function* runWithClaudeAgentSDK(
  sdk: ClaudeAgentSDKModule,
  options: ClaudeRunnerOptions,
  userInput: string | AsyncIterable<SDKUserMessage>,
): AsyncIterable<string> {
  const outputFormat = options.outputFormat || "stream-json";

  switch (outputFormat) {
    case "text":
      yield* runWithTextOutput(sdk, options, userInput);
      break;
    case "json":
      yield* runWithJSONOutput(sdk, options, userInput);
      break;
    case "stream-json":
      yield* runWithStreamJSONOutput(sdk, options, userInput);
      break;
    // case "stream":
    default:
      yield* runWithAISDKUIOutput(sdk, options, userInput);
      break;
  }
}

/**
 * Create SDK options for query
 */
function createSDKOptions(options: ClaudeRunnerOptions): Options {
  return {
    model: options.model,
    systemPrompt: options.systemPrompt,
    maxTurns: options.maxTurns,
    allowedTools: [
      ...(options.allowedTools ?? []),
      "Skill",
      "WebSearch",
      "WebFetch",
    ],
    cwd: options.cwd,
    env: options.env,
    resume: options.resume,
    settingSources: ["project", "user"],
    canUseTool: createCanUseToolCallback(options),
    // Bypass all permission checks for automated execution
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    // Enable partial messages for streaming
    includePartialMessages: options.includePartialMessages,
  };
}

/**
 * Setup abort handler for query iterator
 * Returns a cleanup function to remove the event listener
 */
function setupAbortHandler(
  queryIterator: Query,
  signal?: AbortSignal,
): () => void {
  const abortHandler = async () => {
    console.error(
      "[ClaudeRunner] Abort signal received, will call query.interrupt()...",
    );
    await queryIterator.interrupt();
    console.error("[ClaudeRunner] query.interrupt() completed");
  };

  if (signal) {
    console.error("[ClaudeRunner] Signal provided, adding abort listener");
    signal.addEventListener("abort", abortHandler);

    if (signal.aborted) {
      console.error("[ClaudeRunner] Signal already aborted!");
    }
  } else {
    console.error("[ClaudeRunner] No signal provided");
  }

  // Return cleanup function to remove the listener
  return () => {
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
      console.error("[ClaudeRunner] Abort listener removed");
    }
  };
}

/**
 * Output format: "text"
 * Only outputs the final result text (like Claude Code CLI --output-format text)
 */
async function* runWithTextOutput(
  sdk: ClaudeAgentSDKModule,
  options: ClaudeRunnerOptions,
  userInput: string | AsyncIterable<SDKUserMessage>,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const sdkOptions = createSDKOptions(options);
  const queryIterator = sdk.query({ prompt: userInput, options: sdkOptions });
  const cleanup = setupAbortHandler(
    queryIterator,
    options.abortController?.signal,
  );

  try {
    let resultText = "";
    for await (const message of queryIterator) {
      // Only capture the final result message
      if (message.type === "result") {
        const resultMsg = message as SDKResultMessage;
        // result field only exists when subtype is 'success'
        if (resultMsg.subtype === "success") {
          resultText = resultMsg.result || "";
        }
      }
    }
    // Output plain text result
    yield resultText;
  } finally {
    cleanup();
  }
}

/**
 * Output format: "json"
 * Only outputs the final result as a single JSON object (like Claude Code CLI --output-format json)
 */
async function* runWithJSONOutput(
  sdk: ClaudeAgentSDKModule,
  options: ClaudeRunnerOptions,
  userInput: string | AsyncIterable<SDKUserMessage>,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const sdkOptions = createSDKOptions(options);
  const queryIterator = sdk.query({ prompt: userInput, options: sdkOptions });
  const cleanup = setupAbortHandler(queryIterator, signal);

  try {
    let resultMessage: SDKMessage | null = null;
    for await (const message of queryIterator) {
      // Only capture the final result message
      if (message.type === "result") {
        resultMessage = message;
      }
    }
    // Output single JSON result
    if (resultMessage) {
      yield JSON.stringify(resultMessage) + "\n";
    }
  } finally {
    cleanup();
  }
}

/**
 * Output format: "stream-json"
 * Outputs each SDK message as a JSON object per line (like Claude Code CLI --output-format stream-json)
 */
async function* runWithStreamJSONOutput(
  sdk: ClaudeAgentSDKModule,
  options: ClaudeRunnerOptions,
  userInput: string | AsyncIterable<SDKUserMessage>,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const sdkOptions = createSDKOptions(options);
  const queryIterator = sdk.query({ prompt: userInput, options: sdkOptions });
  const cleanup = setupAbortHandler(queryIterator, signal);

  try {
    for await (const message of queryIterator) {
      // Output each message as JSON line (NDJSON format)
      yield JSON.stringify(message) + "\n";
    }
  } finally {
    cleanup();
  }
}

/**
 * Output format: "stream-ai-sdk-ui-message"
 * Outputs SSE-based AI SDK UI Data Stream format
 */
async function* runWithAISDKUIOutput(
  sdk: ClaudeAgentSDKModule,
  options: ClaudeRunnerOptions,
  userInput: string | AsyncIterable<SDKUserMessage>,
): AsyncIterable<string> {
  const sdkOptions = createSDKOptions({
    ...options,
    includePartialMessages: true,
  });
  const queryIterator = sdk.query({ prompt: userInput, options: sdkOptions });
  const cleanup = setupAbortHandler(
    queryIterator,
    options.abortController?.signal,
  );

  try {
    yield* streamSDKMessagesToAISDKUI(queryIterator, { cwd: options.cwd });
  } finally {
    cleanup();
  }
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
      usage: convertUsageToAISDK({
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }),
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
      usage: convertUsageToAISDK({
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }),
    });
    yield `data: [DONE]\n\n`;
  }
}
