/**
 * Stream utilities: parse runner AsyncIterable<string> (SSE lines) into
 * typed chunks. Uses rawValue fallback so non-standard fields (isError,
 * reasoning.text, finish, message-metadata, etc.) are not silently dropped.
 */

// ---------------------------------------------------------------------------
// Canonical chunk type — superset of UIMessageChunk + runner-specific extras
// ---------------------------------------------------------------------------

export type RunnerChunk =
  // text
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  // reasoning (claude extended / pi)
  | { type: "reasoning"; text: string }
  // tool
  | { type: "tool-input-start"; toolCallId: string; toolName: string }
  | { type: "tool-input-delta"; toolCallId: string; inputTextDelta: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-output-available"; toolCallId: string; output: unknown; isError?: boolean }
  | { type: "tool-output-error"; toolCallId: string; errorText: string }
  // lifecycle
  | { type: "start"; messageId?: string }
  | { type: "finish"; finishReason?: string; messageMetadata?: unknown }
  | { type: "step-finish"; finishReason?: string; usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: "error"; errorText: string }
  | { type: "message-metadata"; messageMetadata: unknown }
  // passthrough for anything else
  | { type: string; [key: string]: unknown };

// ---------------------------------------------------------------------------
// SSE line parser
// ---------------------------------------------------------------------------

function parseSseLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]" || payload === "") return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a runner's AsyncIterable<string> SSE output into typed RunnerChunks.
 * Accepts all chunk types including non-standard runner extensions.
 */
export async function* parseRunnerStream(
  stream: AsyncIterable<string>,
): AsyncIterable<RunnerChunk> {
  let buffer = "";
  try {
    for await (const raw of stream) {
      buffer += raw;
      // SSE events are separated by \n\n
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          const value = parseSseLine(line);
          if (value && typeof value === "object" && "type" in value) {
            yield value as RunnerChunk;
          }
        }
      }
    }
    // Flush remaining buffer
    if (buffer.trim()) {
      for (const line of buffer.split("\n")) {
        const value = parseSseLine(line);
        if (value && typeof value === "object" && "type" in value) {
          yield value as RunnerChunk;
        }
      }
    }
  } catch (e: unknown) {
    yield {
      type: "error",
      errorText: e instanceof Error ? e.message : String(e),
    };
  }
}
