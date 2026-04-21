import { describe, expect, it, vi } from "vitest";
import { BunnyAgentLanguageModel } from "../provider/bunny-agent-language-model";

describe("BunnyAgentLanguageModel stream abort handling", () => {
  it("closes stream gracefully on AbortError", async () => {
    const model = new BunnyAgentLanguageModel({
      id: "test-model",
      options: {
        sandbox: {} as never,
        runner: { model: "test-model" },
        logger: false,
      },
    });

    const abortError = new Error("Operation aborted");
    abortError.name = "AbortError";

    const releaseLock = vi.fn();
    const sourceReader = {
      read: vi.fn().mockRejectedValue(abortError),
      cancel: vi.fn(),
      releaseLock,
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const stream = (
      model as unknown as {
        createLanguageModelStreamFromSseReader(
          reader: ReadableStreamDefaultReader<Uint8Array>,
        ): ReadableStream<unknown>;
      }
    ).createLanguageModelStreamFromSseReader(sourceReader);

    const reader = stream.getReader();
    const result = await reader.read();

    expect(result.done).toBe(true);
    expect(result.value).toBeUndefined();
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});
