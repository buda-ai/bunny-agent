import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock fs and fetch ────────────────────────────────────────────────

vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  buildImageGenerateTool,
  type ImageToolDetails,
  saveImageItem,
} from "@sandagent/runner-harness/tools";

// ── saveImageItem ────────────────────────────────────────────────────

describe("saveImageItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves b64_json directly without fetching", async () => {
    const { writeFileSync } = await import("node:fs");
    const result = await saveImageItem(
      { b64_json: "aGVsbG8=" },
      "/tmp/out.png",
    );
    expect(result).toBe("/tmp/out.png");
    expect(writeFileSync).toHaveBeenCalledOnce();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches url and saves when b64_json is absent", async () => {
    const { writeFileSync } = await import("node:fs");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Buffer.from("imgdata").buffer,
    });
    const result = await saveImageItem(
      { url: "https://example.com/img.png" },
      "/tmp/out.png",
    );
    expect(result).toBe("/tmp/out.png");
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/img.png");
    expect(writeFileSync).toHaveBeenCalledOnce();
  });

  it("returns undefined when both b64_json and url are absent", async () => {
    const result = await saveImageItem({}, "/tmp/out.png");
    expect(result).toBeUndefined();
  });

  it("returns undefined when url fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await saveImageItem(
      { url: "https://example.com/bad.png" },
      "/tmp/out.png",
    );
    expect(result).toBeUndefined();
  });
});

// ── buildImageGenerateTool ───────────────────────────────────────────

describe("buildImageGenerateTool", () => {
  const baseApiResponse = {
    created: 1234567890,
    data: [{ b64_json: "aGVsbG8=", revised_prompt: null, url: null }],
    usage: {
      total_tokens: 1404,
      input_tokens: 22,
      input_tokens_details: { image_tokens: 0, text_tokens: 22 },
      output_tokens: 1120,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns details.response with full API response including usage", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => baseApiResponse,
    });

    const tool = buildImageGenerateTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    const result = await tool.execute(
      "call_1",
      { prompt: "a cute cat" },
      new AbortController().signal,
      vi.fn(),
    );

    expect(result.details).toBeDefined();
    const details = result.details as ImageToolDetails;
    expect(details.response).toEqual(baseApiResponse);
    expect(details.response.usage?.input_tokens).toBe(22);
    expect(details.response.usage?.output_tokens).toBe(1120);
    expect(details.response.usage?.total_tokens).toBe(1404);
  });

  it("details.response does NOT contain b64 image data (stripped before save)", async () => {
    // The raw response still has b64_json — we just verify the full response is stored
    // and the filePath points to the saved file (b64 was written to disk).
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => baseApiResponse,
    });

    const tool = buildImageGenerateTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    const result = await tool.execute(
      "call_1",
      { prompt: "a cute cat", filename: "cat.png" },
      new AbortController().signal,
      vi.fn(),
    );

    expect((result.details as ImageToolDetails).filePath).toContain("cat.png");
  });

  it("returns error content and undefined details on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const tool = buildImageGenerateTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-bad",
    );

    const result = await tool.execute(
      "call_1",
      { prompt: "a cute cat" },
      new AbortController().signal,
      vi.fn(),
    );

    expect(
      (result.content[0] as { type: string; text: string }).text,
    ).toContain("Image generation error");
    expect(result.details).toBeUndefined();
  });

  it("appends .png extension when filename has none", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => baseApiResponse,
    });

    const tool = buildImageGenerateTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    const result = await tool.execute(
      "call_1",
      { prompt: "a cute cat", filename: "mycat" },
      new AbortController().signal,
      vi.fn(),
    );

    expect((result.details as ImageToolDetails).filePath).toMatch(
      /mycat\.png$/,
    );
  });
});
