import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock fs and fetch ────────────────────────────────────────────────

vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  buildImageEditTool,
  buildImageGenerateTool,
  type ImageToolDetails,
  saveImageItem,
} from "../image-tools.js";

// Minimal stub for ExtensionContext required by tool.execute signature
const mockCtx = {} as Parameters<
  ReturnType<typeof buildImageGenerateTool>["execute"]
>[4];

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
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/img.png", {
      headers: {},
    });
    expect(writeFileSync).toHaveBeenCalledOnce();
  });

  it("supports image_url field and forwards bearer token when provided", async () => {
    const { writeFileSync } = await import("node:fs");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => Buffer.from("imgdata").buffer,
    });
    const result = await saveImageItem(
      { image_url: "https://example.com/protected.png" },
      "/tmp/out.png",
      "sk-test",
    );
    expect(result).toBe("/tmp/out.png");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/protected.png",
      {
        headers: { Authorization: "Bearer sk-test" },
      },
    );
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
      mockCtx,
    );

    expect(result.details).toBeDefined();
    const details = result.details as ImageToolDetails;
    expect(details.response).toEqual(baseApiResponse);
    expect(details.response.usage?.input_tokens).toBe(22);
    expect(details.response.usage?.output_tokens).toBe(1120);
    expect(details.response.usage?.total_tokens).toBe(1404);
    expect(details.usage?.raw["gpt-image-1"]).toEqual(baseApiResponse.usage);
  });

  it("details.response keeps full image response payload", async () => {
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
      mockCtx,
    );

    expect((result.details as ImageToolDetails).response).toEqual(
      baseApiResponse,
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
      mockCtx,
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
      mockCtx,
    );

    expect((result.details as ImageToolDetails).filePath).toMatch(
      /mycat\.png$/,
    );
  });

  it("reads image data from output[] fallback response format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        created: 1234567890,
        output: [{ b64_json: "aGVsbG8=" }],
      }),
    });

    const tool = buildImageGenerateTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    const result = await tool.execute(
      "call_1",
      { prompt: "a cute cat", filename: "fallback.png" },
      new AbortController().signal,
      vi.fn(),
      mockCtx,
    );

    expect((result.details as ImageToolDetails).filePath).toContain(
      "fallback.png",
    );
  });
});

describe("buildImageEditTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses source file extension to set multipart mime", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("file"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: "aGVsbG8=" }] }),
    });

    const tool = buildImageEditTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    await tool.execute(
      "call_1",
      { image: "input.jpg", prompt: "remove watermark", filename: "out.jpg" },
      new AbortController().signal,
      vi.fn(),
      mockCtx,
    );

    expect(mockFetch).toHaveBeenCalled();
    const request = mockFetch.mock.calls[0]?.[1] as { body?: Buffer };
    const bodyString = request.body?.toString("utf8") ?? "";
    expect(bodyString).toContain("Content-Type: image/jpeg");
  });

  it("returns a concise message when edit response has no image payload", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("file"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{}], usage: { input_tokens: 1 } }),
    });

    const tool = buildImageEditTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    const result = await tool.execute(
      "call_2",
      { image: "input.png", prompt: "remove watermark", filename: "out.png" },
      new AbortController().signal,
      vi.fn(),
      mockCtx,
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain(
      "Image edited but could not be saved: no image payload returned",
    );
    expect(text).toContain("image_model: gpt-image-1");
  });

  it("saves when edit response data[0] is a base64 string", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("file"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: ["aGVsbG8="] }),
    });

    const tool = buildImageEditTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    const result = await tool.execute(
      "call_3",
      { image: "input.png", prompt: "remove watermark", filename: "out.png" },
      new AbortController().signal,
      vi.fn(),
      mockCtx,
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("/tmp/out.png");
  });

  it("saves when edit response uses camelCase imageBase64", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("file"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        created: 1234567890,
        background: false,
        data: [{ imageBase64: "aGVsbG8=" }],
        output_format: "png",
        quality: "high",
        size: "1024x1024",
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    });

    const tool = buildImageEditTool(
      "/tmp",
      "gemini-3-pro-image",
      "https://api.openai.com",
      "sk-test",
    );

    const result = await tool.execute(
      "call_3b",
      { image: "input.png", prompt: "remove watermark", filename: "out.png" },
      new AbortController().signal,
      vi.fn(),
      mockCtx,
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("/tmp/out.png");
  });

  it("sends response format hints for edit requests", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("file"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: ["aGVsbG8="] }),
    });

    const tool = buildImageEditTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    await tool.execute(
      "call_4",
      { image: "input.png", prompt: "remove watermark", filename: "out.png" },
      new AbortController().signal,
      vi.fn(),
      mockCtx,
    );

    const request = mockFetch.mock.calls[0]?.[1] as { body?: Buffer };
    const bodyString = request.body?.toString("utf8") ?? "";
    expect(bodyString).toContain('name="response_format"');
    expect(bodyString).toContain("b64_json");
    expect(bodyString).toContain('name="output_format"');
    expect(bodyString).toContain("png");
  });

  it("omits size/quality fields when not provided", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("file"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: ["aGVsbG8="] }),
    });

    const tool = buildImageEditTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    await tool.execute(
      "call_5",
      { image: "input.png", prompt: "clean lower area", filename: "out.png" },
      new AbortController().signal,
      vi.fn(),
      mockCtx,
    );

    const request = mockFetch.mock.calls[0]?.[1] as { body?: Buffer };
    const bodyString = request.body?.toString("utf8") ?? "";
    expect(bodyString).not.toContain('name="size"');
    expect(bodyString).not.toContain('name="quality"');
  });

  it("retries once with policy-safe prompt when risky wording gets empty data", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from("file"));
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: "aGVsbG8=" }] }),
      });

    const tool = buildImageEditTool(
      "/tmp",
      "gpt-image-1",
      "https://api.openai.com",
      "sk-test",
    );

    const result = await tool.execute(
      "call_6",
      {
        image: "input.png",
        prompt: "remove watermark and logos from this image",
        filename: "out.png",
      },
      new AbortController().signal,
      vi.fn(),
      mockCtx,
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstRequest = mockFetch.mock.calls[0]?.[1] as { body?: Buffer };
    const secondRequest = mockFetch.mock.calls[1]?.[1] as { body?: Buffer };
    const firstBody = firstRequest.body?.toString("utf8") ?? "";
    const secondBody = secondRequest.body?.toString("utf8") ?? "";
    expect(firstBody).toContain("Clean up distracting overlay text or marks");
    expect(secondBody).toContain(
      "Remove only distracting overlay text artifacts naturally",
    );

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain("/tmp/out.png");
  });
});
