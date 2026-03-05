import { describe, expect, it } from "vitest";
import {
  buildGeminiChildEnv,
  mapGeminiEventToChunks,
  normalizeGeminiModel,
} from "../gemini-runner.js";

describe("normalizeGeminiModel", () => {
  it("strips google provider prefix", () => {
    expect(normalizeGeminiModel("google:gemini-2.5-pro")).toBe("gemini-2.5-pro");
  });

  it("strips gemini provider prefix", () => {
    expect(normalizeGeminiModel("gemini:gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });

  it("keeps direct model name", () => {
    expect(normalizeGeminiModel("gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });
});

describe("mapGeminiEventToChunks", () => {
  it("maps assistant message events to text chunks", () => {
    const chunks = mapGeminiEventToChunks({
      type: "message",
      role: "assistant",
      content: "hello",
    });

    expect(chunks).toEqual([`0:${JSON.stringify("hello")}\n`]);
  });

  it("maps result events to finish chunk", () => {
    const chunks = mapGeminiEventToChunks({
      type: "result",
      status: "success",
      stats: { total_tokens: 10 },
    });

    expect(chunks).toEqual([
      `d:${JSON.stringify({ finishReason: "stop", usage: { total_tokens: 10 } })}\n`,
    ]);
  });
});

describe("buildGeminiChildEnv", () => {
  it("maps GEMINI_BASE_URL to GOOGLE_GEMINI_BASE_URL when missing", async () => {
    const env = buildGeminiChildEnv({
      GEMINI_BASE_URL: "https://example.com",
    });

    expect(env.GOOGLE_GEMINI_BASE_URL).toBe("https://example.com");
  });
});
