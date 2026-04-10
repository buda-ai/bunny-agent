/**
 * Stream utilities: convert runner AsyncIterable<string> (SSE lines)
 * into a typed ReadableStream<UIMessageChunk> using Vercel AI SDK.
 */
import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import type { UIMessageChunk } from "ai";

export type { UIMessageChunk };

/**
 * Convert AsyncIterable<string> of SSE lines into ReadableStream<Uint8Array>.
 */
function asyncIterableToReadableStream(iter: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of iter) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

/**
 * Parse a runner's AsyncIterable<string> output into a stream of UIMessageChunks.
 * Each chunk is a typed AI SDK UI message part (text-delta, tool-input-start, etc.)
 */
export function parseRunnerStream(stream: AsyncIterable<string>): ReadableStream<UIMessageChunk> {
  const byteStream = asyncIterableToReadableStream(stream);
  const parsed = parseJsonEventStream({ stream: byteStream, schema: uiMessageChunkSchema });

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const reader = parsed.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.success) controller.enqueue(value.value);
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
