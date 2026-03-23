import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import {
  AISDKStreamConverter,
  convertUsageToAISDK,
  formatDataStream,
  generateId,
  isAbortError,
  isClaudeCodeTruncationError,
  mapFinishReason,
  streamSDKMessagesToAISDKUI,
} from "../ai-sdk-stream.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Turn an array of SDK messages into an AsyncIterable */
async function* toAsyncIterable(
  messages: SDKMessage[],
): AsyncIterable<SDKMessage> {
  for (const m of messages) yield m;
}

/** Collect all chunks from an async generator */
async function collect(gen: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const c of gen) chunks.push(c);
  return chunks;
}

/** Parse a single SSE data line back to object */
function parseSSE(chunk: string): Record<string, unknown> | null {
  if (!chunk.startsWith("data: ")) return null;
  const json = chunk.slice(6).trim();
  if (json === "[DONE]") return null;
  return JSON.parse(json);
}

/** Collect and parse all SSE events (skipping [DONE]) */
async function collectEvents(
  gen: AsyncIterable<string>,
): Promise<Record<string, unknown>[]> {
  const chunks = await collect(gen);
  return chunks.map(parseSSE).filter(Boolean) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Unit tests: utility functions
// ---------------------------------------------------------------------------

describe("formatDataStream", () => {
  it("formats data as SSE", () => {
    const result = formatDataStream({ type: "test", value: 1 });
    expect(result).toBe('data: {"type":"test","value":1}\n\n');
  });
});

describe("generateId", () => {
  it("returns a string", () => {
    expect(typeof generateId()).toBe("string");
  });
  it("returns unique values", () => {
    expect(generateId()).not.toBe(generateId());
  });
});

describe("isAbortError", () => {
  it("detects AbortError by name", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });
  it("detects AbortError by code", () => {
    const err = Object.assign(new Error(), { code: "ABORT_ERR" });
    expect(isAbortError(err)).toBe(true);
  });
  it("returns false for regular errors", () => {
    expect(isAbortError(new Error("nope"))).toBe(false);
  });
  it("returns false for non-objects", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("string")).toBe(false);
  });
});

describe("isClaudeCodeTruncationError", () => {
  it("detects truncated JSON", () => {
    const err = new SyntaxError("Unexpected end of JSON input");
    expect(isClaudeCodeTruncationError(err, "x".repeat(600))).toBe(true);
  });
  it("returns false for short buffer", () => {
    const err = new SyntaxError("Unexpected end of JSON input");
    expect(isClaudeCodeTruncationError(err, "short")).toBe(false);
  });
  it("returns false for non-syntax errors", () => {
    expect(
      isClaudeCodeTruncationError(new Error("other"), "x".repeat(600)),
    ).toBe(false);
  });
});

describe("convertUsageToAISDK", () => {
  it("converts usage with all fields", () => {
    const result = convertUsageToAISDK({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 20,
    });
    expect(result.inputTokens.total).toBe(130);
    expect(result.inputTokens.noCache).toBe(100);
    expect(result.inputTokens.cacheRead).toBe(20);
    expect(result.inputTokens.cacheWrite).toBe(10);
    expect(result.outputTokens.total).toBe(50);
  });
  it("handles empty/null fields", () => {
    const result = convertUsageToAISDK({});
    expect(result.inputTokens.total).toBe(0);
    expect(result.outputTokens.total).toBe(0);
  });
});

describe("mapFinishReason", () => {
  it("maps success to stop", () => {
    expect(mapFinishReason("success")).toBe("stop");
  });
  it("maps error_max_turns to length", () => {
    expect(mapFinishReason("error_max_turns")).toBe("length");
  });
  it("maps error_during_execution to error", () => {
    expect(mapFinishReason("error_during_execution")).toBe("error");
  });
  it("returns error when isError is true", () => {
    expect(mapFinishReason("success", true)).toBe("error");
  });
  it("maps undefined to stop", () => {
    expect(mapFinishReason(undefined)).toBe("stop");
  });
  it("maps unknown to other", () => {
    expect(mapFinishReason("something_else")).toBe("other");
  });
});

// ---------------------------------------------------------------------------
// Integration tests: AISDKStreamConverter.stream()
// ---------------------------------------------------------------------------

describe("AISDKStreamConverter", () => {
  // Minimal system init message
  const systemInit: SDKMessage = {
    type: "system",
    subtype: "init",
    session_id: "test-session-123",
    tools: ["Bash", "Read"],
    model: "claude-sonnet-4-20250514",
    agents: [],
    skills: [],
  } as unknown as SDKMessage;

  // Success result message
  const successResult: SDKMessage = {
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1000,
    duration_api_ms: 800,
    num_turns: 1,
    result: "Done",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    session_id: "test-session-123",
  } as unknown as SDKMessage;

  describe("system init", () => {
    it("sets session ID from system init", async () => {
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(
        converter.stream(toAsyncIterable([systemInit, successResult])),
      );
      const finish = events.find((e) => e.type === "finish");
      expect(finish).toBeDefined();
      expect(
        (finish!.messageMetadata as Record<string, unknown>).sessionId,
      ).toBe("test-session-123");
    });
  });

  describe("result message - success", () => {
    it("emits finish with stop reason", async () => {
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(
        converter.stream(toAsyncIterable([systemInit, successResult])),
      );
      const finish = events.find((e) => e.type === "finish");
      expect(finish).toBeDefined();
      expect(finish!.finishReason).toBe("stop");
    });

    it("does not emit error event on success", async () => {
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(
        converter.stream(toAsyncIterable([systemInit, successResult])),
      );
      expect(events.find((e) => e.type === "error")).toBeUndefined();
    });
  });

  describe("result message - auth error (403)", () => {
    const authErrorResult: SDKMessage = {
      type: "result",
      subtype: "success",
      is_error: true,
      duration_ms: 192992,
      duration_api_ms: 0,
      num_turns: 1,
      result:
        'Failed to authenticate. API Error: 403 {"Message":"Authentication failed: Please make sure your API Key is valid."}',
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      session_id: "test-session-123",
    } as unknown as SDKMessage;

    it("emits error event with result text", async () => {
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(
        converter.stream(toAsyncIterable([systemInit, authErrorResult])),
      );
      const error = events.find((e) => e.type === "error");
      expect(error).toBeDefined();
      expect(error!.errorText).toContain("Failed to authenticate");
      expect(error!.errorText).toContain("403");
    });

    it("emits finish with error reason", async () => {
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(
        converter.stream(toAsyncIterable([systemInit, authErrorResult])),
      );
      const finish = events.find((e) => e.type === "finish");
      expect(finish).toBeDefined();
      expect(finish!.finishReason).toBe("error");
    });

    it("emits error before finish", async () => {
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(
        converter.stream(toAsyncIterable([systemInit, authErrorResult])),
      );
      const errorIdx = events.findIndex((e) => e.type === "error");
      const finishIdx = events.findIndex((e) => e.type === "finish");
      expect(errorIdx).toBeGreaterThanOrEqual(0);
      expect(finishIdx).toBeGreaterThan(errorIdx);
    });
  });

  describe("assistant message with tool use", () => {
    const assistantWithTool: SDKMessage = {
      type: "assistant",
      message: {
        id: "msg-1",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool-call-1",
            name: "Bash",
            input: { command: "ls" },
          },
        ],
      },
    } as unknown as SDKMessage;

    it("emits tool-input-available", async () => {
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(
        converter.stream(
          toAsyncIterable([systemInit, assistantWithTool, successResult]),
        ),
      );
      const toolEvent = events.find((e) => e.type === "tool-input-available");
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.toolCallId).toBe("tool-call-1");
      expect(toolEvent!.toolName).toBe("Bash");
    });
  });

  describe("assistant message with no content", () => {
    const emptyAssistant: SDKMessage = {
      type: "assistant",
      message: { id: "msg-1", role: "assistant", content: null },
    } as unknown as SDKMessage;

    it("skips gracefully", async () => {
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(
        converter.stream(
          toAsyncIterable([systemInit, emptyAssistant, successResult]),
        ),
      );
      // Should only have finish, no errors
      expect(events.find((e) => e.type === "error")).toBeUndefined();
      expect(events.find((e) => e.type === "finish")).toBeDefined();
    });
  });

  describe("stream always ends with [DONE]", () => {
    it("emits [DONE] as last chunk on success", async () => {
      const converter = new AISDKStreamConverter();
      const chunks = await collect(
        converter.stream(toAsyncIterable([systemInit, successResult])),
      );
      expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
    });

    it("emits [DONE] as last chunk on error", async () => {
      async function* failing(): AsyncIterable<SDKMessage> {
        yield systemInit;
        throw new Error("boom");
      }
      const converter = new AISDKStreamConverter();
      const chunks = await collect(converter.stream(failing()));
      expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
    });
  });

  describe("error handling in catch block", () => {
    it("emits error + finish for thrown errors", async () => {
      async function* failing(): AsyncIterable<SDKMessage> {
        yield systemInit;
        throw new Error("something broke");
      }
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(converter.stream(failing()));
      const error = events.find((e) => e.type === "error");
      expect(error).toBeDefined();
      expect(error!.errorText).toBe("something broke");
      const finish = events.find((e) => e.type === "finish");
      expect(finish).toBeDefined();
      expect(finish!.finishReason).toBe("error");
    });

    it("does not emit error for AbortError", async () => {
      async function* aborting(): AsyncIterable<SDKMessage> {
        yield systemInit;
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      const converter = new AISDKStreamConverter();
      const events = await collectEvents(converter.stream(aborting()));
      expect(events.find((e) => e.type === "error")).toBeUndefined();
      expect(events.find((e) => e.type === "finish")).toBeUndefined();
    });
  });
});

describe("streamSDKMessagesToAISDKUI (deprecated wrapper)", () => {
  it("works as a drop-in wrapper", async () => {
    const result: SDKMessage = {
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 100,
      num_turns: 1,
      result: "ok",
      usage: { input_tokens: 0, output_tokens: 0 },
    } as unknown as SDKMessage;

    async function* msgs(): AsyncIterable<SDKMessage> {
      yield result;
    }

    const chunks = await collect(streamSDKMessagesToAISDKUI(msgs()));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
  });
});
