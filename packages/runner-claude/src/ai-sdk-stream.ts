/**
 * AI SDK UI Stream Protocol utilities
 *
 * This module provides helpers for converting Claude Agent SDK messages
 * to the AI SDK UI Data Stream Protocol format.
 *
 * Inspired by: https://github.com/ben-vargas/ai-sdk-provider-claude-code
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
 */

import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
// ============================================================================
// Types
// ============================================================================

/**
 * Tracks the streaming lifecycle state for a single tool invocation.
 */
export interface ToolStreamState {
  name: string;
  lastSerializedInput?: string;
  inputStarted: boolean;
  inputClosed: boolean;
  callEmitted: boolean;
}

/**
 * Usage data from Claude Agent SDK
 */
export interface ClaudeCodeUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

type RawMessageStreamContentBlockStart =
  | {
      type: "content_block_start";
      index: number;
      content_block: {
        type: "text";
        text: string;
      };
    }
  | {
      type: "content_block_start";
      index: number;
      content_block: {
        type: "tool_use";
        id: string;
        name: string;
        input: unknown;
      };
    };

type RawMessageStreamContentBlockDelta =
  | {
      type: "content_block_delta";
      index: number;
      delta: {
        type: "text_delta";
        text: string;
      };
    }
  | {
      type: "content_block_delta";
      index: number;
      delta: {
        type: "input_json_delta";
        partial_json: string;
      };
    };

type RawMessageStreamContentBlockStop = {
  type: "content_block_stop";
  index: number;
};

type RawMessageStreamEvent =
  | RawMessageStreamContentBlockStart
  | RawMessageStreamContentBlockDelta
  | RawMessageStreamContentBlockStop;

/**
 * AI SDK usage format
 */
export interface AISDKUsage {
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
}

/**
 * Options for streaming SDK messages to AI SDK UI format
 */
export interface StreamToAISDKUIOptions {
  signal?: AbortSignal;
  /** Working directory for debug files (default: process.cwd()) */
  cwd?: string;
}

// ============================================================================
// Debug Trace
// ============================================================================

/**
 * Simple debug trace — appends a JSON line to the debug file.
 * Call with `reset=true` to clear the file (on session init).
 */
function trace(data: unknown, reset = false): void {
  if (process.env.DEBUG !== "true") return;
  try {
    const file = join(process.cwd(), "claude-message-stream-debug.json");
    if (reset && existsSync(file)) unlinkSync(file);
    const entry = {
      _t: new Date().toISOString(),
      ...(typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : { value: data }),
    };
    appendFileSync(file, JSON.stringify(entry, null, 2) + ",\n");
  } catch {}
}

// ============================================================================
// Constants
// ============================================================================

const MIN_TRUNCATION_LENGTH = 512;
const UNKNOWN_TOOL_NAME = "unknown-tool";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format data for SSE stream
 */
export function formatDataStream(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Check if an error is an AbortError
 */
export function isAbortError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { name?: unknown; code?: unknown };
    if (typeof e.name === "string" && e.name === "AbortError") return true;
    if (typeof e.code === "string" && e.code.toUpperCase() === "ABORT_ERR")
      return true;
  }
  return false;
}

/**
 * Detects if an error represents a truncated SDK JSON stream.
 */
export function isClaudeCodeTruncationError(
  error: unknown,
  bufferedText: string,
): boolean {
  const isSyntaxError =
    error instanceof SyntaxError ||
    (typeof (error as { name?: string })?.name === "string" &&
      (error as { name: string }).name.toLowerCase() === "syntaxerror");

  if (!isSyntaxError || !bufferedText) return false;

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

  return (
    truncationIndicators.some((indicator) => message.includes(indicator)) &&
    bufferedText.length >= MIN_TRUNCATION_LENGTH
  );
}

/**
 * Converts Claude Code SDK usage to AI SDK usage format
 */
export function convertUsageToAISDK(usage: ClaudeCodeUsage): AISDKUsage {
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  // Try to extract text/reasoning tokens if available (even if not in type definition)
  const usageAny = usage as Record<string, unknown>;
  const textTokens =
    typeof usageAny.text_tokens === "number" ? usageAny.text_tokens : undefined;
  const reasoningTokens =
    typeof usageAny.reasoning_tokens === "number"
      ? usageAny.reasoning_tokens
      : undefined;

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
    raw: usage,
  };
}

/**
 * Finish reason type
 *
 * Can be one of the following:
- `stop`: model generated stop sequence
- `length`: model generated maximum number of tokens
- `content-filter`: content filter violation stopped the model
- `tool-calls`: model triggered tool calls
- `error`: model stopped because of an error
- `other`: model stopped for other reasons
*/
type FinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other";

/**
 * Maps Claude Agent SDK result subtypes to AI SDK finish reasons
 */
export function mapFinishReason(
  subtype?: string,
  isError?: boolean,
): FinishReason {
  if (isError) return "error";

  switch (subtype) {
    case "success":
      return "stop";
    case "error_max_turns":
      return "length";
    case "error_during_execution":
    case "error_max_structured_output_retries":
      return "error";
    case undefined:
      return "stop";
    default:
      return "other";
  }
}

// ============================================================================
// Tool Extraction Helpers
// ============================================================================

interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

function extractToolUses(content: unknown): ToolUse[] {
  if (!Array.isArray(content)) return [];

  return content
    .filter(
      (
        item,
      ): item is {
        type: string;
        id?: string;
        name?: string;
        input?: unknown;
      } =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "tool_use",
    )
    .map((item) => ({
      id: item.id || generateId(),
      name: item.name || UNKNOWN_TOOL_NAME,
      input: item.input,
    }));
}

// ============================================================================
// Main Stream Class
// ============================================================================

/**
 * Converts Claude Agent SDK messages to AI SDK UI Data Stream format
 *
 * This class processes Claude Agent SDK messages and yields SSE-formatted
 * strings compatible with AI SDK UI stream protocol.
 */
export class AISDKStreamConverter {
  private systemMessage: SDKSystemMessage | undefined;
  private hasEmittedStart = false;
  private sessionId: string | undefined;

  private readonly partIdMap = new Map<string, string>();

  /**
   * Get the current session ID from the stream
   */
  get currentSessionId(): string {
    if (!this.sessionId) {
      throw new Error("Session ID is not set");
    }
    return this.sessionId;
  }

  /**
   * Helper to emit SSE data
   */
  private emit(data: Record<string, unknown>): string {
    return formatDataStream(data);
  }

  private setPartId(index: number, partId: string): void {
    const partIdKey = `${this.currentSessionId}-${index}`;
    this.partIdMap.set(partIdKey, partId);
  }

  private getPartId(index: number): string {
    const partIdKey = `${this.currentSessionId}-${index}`;
    if (this.partIdMap.has(partIdKey)) {
      return this.partIdMap.get(partIdKey) ?? "";
    }
    throw new Error("Part ID not found");
  }

  /**
   * Helper to emit tool call
   */
  private *emitToolCall(
    message: SDKPartialAssistantMessage,
  ): Generator<string> {
    const event = message.event as RawMessageStreamEvent;
    if (
      event.type === "content_block_start" &&
      event.content_block.type === "tool_use"
    ) {
      const toolCallId = event.content_block.id;
      this.setPartId(event.index, toolCallId);
      yield this.emit({
        type: "tool-input-start",
        toolCallId,
        toolName: event.content_block.name,
        dynamic: true,
        providerExecuted: true,
      });
    }
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "input_json_delta"
    ) {
      yield this.emit({
        type: "tool-input-delta",
        toolCallId: this.getPartId(event.index),
        inputTextDelta: event.delta.partial_json,
      });
    }
  }

  private *emitTextBlockEvent(event: RawMessageStreamEvent): Generator<string> {
    if (
      event.type === "content_block_start" &&
      event.content_block.type === "text"
    ) {
      const partId = `text_${generateId()}`;
      this.setPartId(event.index, partId);
      yield this.emit({
        type: "text-start",
        id: partId,
      });
    }
    // Handle text_delta events
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta"
    ) {
      yield this.emit({
        type: "text-delta",
        id: this.getPartId(event.index),
        delta: event.delta.text,
      });
    }

    if (event.type === "content_block_stop") {
      const partId = this.getPartId(event.index);
      if (partId.startsWith("text_")) {
        yield this.emit({ type: "text-end", id: partId });
      }
    }
  }

  /**
   * Stream SDK messages and convert to AI SDK UI Data Stream format
   */
  async *stream(
    messageIterator: AsyncIterable<SDKMessage>,
  ): AsyncGenerator<string> {
    try {
      for await (const message of messageIterator) {
        // Handle system init message
        if (message.type === "system" && message.subtype === "init") {
          trace(null, true); // reset debug file
          this.systemMessage = message as SDKSystemMessage;
          this.sessionId = this.systemMessage.session_id;
        }

        trace(message);

        // Handle streaming events (token-by-token via includePartialMessages)
        if (message.type === "stream_event") {
          const streamEvent = message as SDKPartialAssistantMessage;
          const event = streamEvent.event;
          // Only emit start on first message_start (avoid duplicates in multi-turn)
          if (event.type === "message_start" && !this.hasEmittedStart) {
            this.hasEmittedStart = true;
            yield this.emit({ type: "start", messageId: event.message.id });
            yield this.emit({
              type: "message-metadata",
              messageMetadata: {
                tools: this.systemMessage?.tools,
                model: this.systemMessage?.model,
                sessionId: this.systemMessage?.session_id,
                agents: this.systemMessage?.agents,
                skills: this.systemMessage?.skills,
              },
            });
          }
          yield* this.emitTextBlockEvent(event);
          yield* this.emitToolCall(streamEvent);
        }

        // Emit start on first assistant message
        // if (
        //   message.type === "assistant" &&
        //   !this.hasEmittedStart &&
        //   this.systemMessage
        // ) {
        //   const assistantMsg = message as SDKAssistantMessage;
        //   const messageId = assistantMsg.message?.id ?? generateId();
        //   this.hasEmittedStart = true;

        //   yield this.emit({ type: "start", messageId });
        //   yield this.emit({
        //     type: "message-metadata",
        //     messageMetadata: {
        //       tools: this.systemMessage.tools,
        //       model: this.systemMessage.model,
        //       sessionId: this.systemMessage.session_id,
        //     },
        //   });
        // }

        // Process assistant messages
        if (message.type === "assistant") {
          const assistantMsg = message as SDKAssistantMessage;
          const content = assistantMsg.message?.content;
          if (!content) continue;

          const tools = extractToolUses(content);

          // Process tool uses (for non-streaming or fallback)
          for (const tool of tools) {
            yield this.emit({
              type: "tool-input-available",
              toolCallId: tool.id,
              toolName: tool.name,
              input: tool.input,
              dynamic: true,
              providerExecuted: true,
            });
          }
        }

        // // Process user messages (tool results)
        if (message.type === "user") {
          const userMsg = message as SDKUserMessage;
          const content = userMsg.message?.content;
          for (const part of content) {
            if (part.type === "tool_result") {
              yield this.emit({
                type: "tool-output-available",
                toolCallId: part.tool_use_id,
                output: message.tool_use_result || part.content,
                dynamic: true,
                providerExecuted: true,
              });
            }
          }
        }

        if (message.type === "result") {
          const resultMsg = message as SDKResultMessage;

          if (resultMsg.is_error) {
            const errorText =
              (resultMsg as unknown as { result?: string }).result ||
              "Unknown error";
            yield this.emit({
              type: "error",
              errorText,
            });
          }

          // Emit finish
          yield this.emit({
            type: "finish",
            finishReason: mapFinishReason(
              resultMsg.subtype,
              resultMsg.is_error,
            ),
            messageMetadata: {
              usage: convertUsageToAISDK(resultMsg.usage ?? {}),
              sessionId: this.sessionId,
            },
          });
        }

        // // Process result message
        // if (message.type === "result") {
        //   const resultMsg = message as SDKResultMessage;

        //   // Handle structured output errors
        //   if (
        //     (resultMsg.subtype as string) ===
        //     "error_max_structured_output_retries"
        //   ) {
        //     yield this.emit({
        //       type: "error",
        //       errorText:
        //         "Failed to generate valid structured output after maximum retries.",
        //     });
        //   }

        //   // Close text part
        //   if (this.textPartId) {
        //     yield this.emit({ type: "text-end", id: this.textPartId });
        //     this.textPartId = undefined;
        //   }

        //   // Finalize tools

        //   // Emit finish
        //   yield this.emit({
        //     type: "finish",
        //     finishReason: mapFinishReason(
        //       resultMsg.subtype,
        //       resultMsg.is_error,
        //     ),
        //     usage: convertUsageToAISDK(resultMsg.usage),
        //     messageMetadata: {
        //       sessionId: resultMsg.session_id,
        //       duration_ms: resultMsg.duration_ms,
        //       num_turns: resultMsg.num_turns,
        //       total_cost_usd: resultMsg.total_cost_usd,
        //     },
        //   });
        // }
      }

      // Finalize any remaining state
      // if (this.textPartId) {
      //   yield this.emit({ type: "text-end", id: this.textPartId });
      // }
    } catch (error) {
      trace({ error: String(error) });
      if (isAbortError(error)) {
        console.error("[AISDKStream] Operation aborted");
      } else {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[AISDKStream] Error:", errorMessage);
        yield this.emit({ type: "error", errorText: errorMessage });
        yield this.emit({
          type: "finish",
          finishReason: mapFinishReason("error_during_execution", true),
          messageMetadata: {
            usage: convertUsageToAISDK({}),
            sessionId: this.sessionId,
          },
        });
      }
    } finally {
      yield `data: [DONE]\n\n`;
    }
  }
}

/**
 * Stream SDK messages and convert to AI SDK UI Data Stream format
 *
 * This function processes Claude Agent SDK messages and yields SSE-formatted
 * strings compatible with AI SDK UI stream protocol.
 *
 * @deprecated Use AISDKStreamConverter class instead for better state management
 */
export function streamSDKMessagesToAISDKUI(
  messageIterator: AsyncIterable<SDKMessage>,
): AsyncGenerator<string> {
  return new AISDKStreamConverter().stream(messageIterator);
}
