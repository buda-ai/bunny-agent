import { afterEach, describe, expect, it } from "vitest";
import {
  buildWebFetchTool,
  buildWebSearchTool,
  resolveSearchProvider,
  resolveSearchProviders,
} from "../web-tools.js";

describe("resolveSearchProviders", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns empty array when no keys are set", () => {
    delete process.env.BRAVE_API_KEY;
    delete process.env.TAVILY_API_KEY;
    expect(resolveSearchProviders({})).toEqual([]);
  });

  it("returns Brave when BRAVE_API_KEY is set in env map", () => {
    const result = resolveSearchProviders({ BRAVE_API_KEY: "bsk-123" });
    expect(result).toHaveLength(1);
    expect(result[0].provider.id).toBe("brave");
    expect(result[0].apiKey).toBe("bsk-123");
  });

  it("returns Tavily when TAVILY_API_KEY is set in env map", () => {
    const result = resolveSearchProviders({ TAVILY_API_KEY: "tvly-456" });
    expect(result).toHaveLength(1);
    expect(result[0].provider.id).toBe("tavily");
    expect(result[0].apiKey).toBe("tvly-456");
  });

  it("returns both providers ordered Brave > Tavily when both keys set", () => {
    const result = resolveSearchProviders({
      BRAVE_API_KEY: "bsk-123",
      TAVILY_API_KEY: "tvly-456",
    });
    expect(result).toHaveLength(2);
    expect(result[0].provider.id).toBe("brave");
    expect(result[1].provider.id).toBe("tavily");
  });

  it("falls back to process.env for BRAVE_API_KEY", () => {
    process.env.BRAVE_API_KEY = "env-brave";
    const result = resolveSearchProviders({});
    expect(result).toHaveLength(1);
    expect(result[0].provider.id).toBe("brave");
    expect(result[0].apiKey).toBe("env-brave");
  });

  it("falls back to process.env for TAVILY_API_KEY", () => {
    process.env.TAVILY_API_KEY = "env-tavily";
    const result = resolveSearchProviders({});
    expect(result).toHaveLength(1);
    expect(result[0].provider.id).toBe("tavily");
    expect(result[0].apiKey).toBe("env-tavily");
  });

  it("env map overrides process.env", () => {
    process.env.BRAVE_API_KEY = "env-brave";
    const result = resolveSearchProviders({ BRAVE_API_KEY: "param-brave" });
    expect(result[0].apiKey).toBe("param-brave");
  });

  it("ignores empty string keys", () => {
    const result = resolveSearchProviders({ BRAVE_API_KEY: "" });
    expect(result).toEqual([]);
  });
});

describe("resolveSearchProvider", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null when no keys are set", () => {
    delete process.env.BRAVE_API_KEY;
    delete process.env.TAVILY_API_KEY;
    expect(resolveSearchProvider({})).toBeNull();
  });

  it("returns the primary provider (Brave first)", () => {
    const result = resolveSearchProvider({
      BRAVE_API_KEY: "bsk-123",
      TAVILY_API_KEY: "tvly-456",
    });
    expect(result).not.toBeNull();
    expect(result!.provider.id).toBe("brave");
  });

  it("returns Tavily when only Tavily key is set", () => {
    const result = resolveSearchProvider({ TAVILY_API_KEY: "tvly-456" });
    expect(result).not.toBeNull();
    expect(result!.provider.id).toBe("tavily");
  });
});

describe("buildWebSearchTool", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it("returns Brave usage details in tool result", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          web: {
            results: [
              {
                title: "Iran - BBC News",
                url: "https://www.bbc.com/example",
                description: "Latest updates",
                age: "1 day ago",
              },
            ],
          },
        }),
        text: async () => "",
        bytes: async () => new Uint8Array(),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" });
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: unknown;
      }>
    )(
      "call_1",
      { query: "iran latest news", count: 1 },
      undefined,
      undefined,
      {},
    );

    expect(result.content[0]?.type).toBe("text");
    if (result.content[0]?.type !== "text") {
      throw new Error("Expected text content");
    }
    expect(result.content[0].text).toContain("[Brave Search] 1 result(s)");
    expect(result.details).toMatchObject({
      usage: {
        raw: {
          brave: {
            requests: 1,
            fetchedPages: 0,
          },
        },
      },
    });
  });

  it("falls back to Tavily when Brave is rate limited and fetches result content", async () => {
    const responses = [
      {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => "rate limit",
      },
      {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          results: [
            {
              title: "Docs",
              url: "https://docs.example.test/page",
              content: "snippet",
            },
          ],
        }),
        text: async () => "",
      },
      {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          "<html><body><h1>Docs</h1><script>ignore()</script><p>Full &amp; useful content.</p></body></html>",
      },
    ];
    globalThis.fetch = (async () =>
      responses.shift() as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({
      BRAVE_API_KEY: "bsk-test",
      TAVILY_API_KEY: "tvly-test",
    });
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: unknown;
      }>
    )(
      "call_1",
      { query: "docs", count: 1, fetch_content: true },
      undefined,
      undefined,
      {},
    );

    expect(result.content[0]?.text).toContain("[Tavily] 1 result(s)");
    expect(result.content[0]?.text).toContain("Full & useful content.");
    expect(result.details).toMatchObject({
      usage: { raw: { tavily: { requests: 1, fetchedPages: 1 } } },
    });
  });

  it("returns an error payload for non-rate-limit provider failures", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 500,
        statusText: "Server Error",
        text: async () => "boom",
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" });
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: unknown;
      }>
    )("call_1", { query: "docs" }, undefined, undefined, {});

    expect(result.content[0]?.text).toContain("Web search error:");
    expect(result.details).toBeUndefined();
  });

  it("throws when no search provider is configured", () => {
    expect(() => buildWebSearchTool({})).toThrow(
      "web_search: no search provider available",
    );
  });
});

describe("buildWebFetchTool", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("extracts readable text from HTML", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          "<html><body><style>.x{}</style><h1>Title</h1><p>A &lt; B &amp; C</p></body></html>",
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebFetchTool();
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )("call_1", { url: "https://example.test" }, undefined, undefined, {});

    expect(result.content[0]?.text).toContain("Title");
    expect(result.content[0]?.text).toContain("A < B & C");
  });

  it("truncates very large fetched pages", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => `<p>${"x".repeat(50_100)}</p>`,
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebFetchTool();
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )(
      "call_1",
      { url: "https://example.test/large" },
      undefined,
      undefined,
      {},
    );

    expect(result.content[0]?.text).toContain("[Truncated]");
  });

  it("returns HTTP and fetch errors as text content", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebFetchTool();
    const httpResult = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )(
      "call_1",
      { url: "https://example.test/missing" },
      undefined,
      undefined,
      {},
    );
    expect(httpResult.content[0]?.text).toContain("HTTP 404");

    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const errorResult = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )("call_2", { url: "https://example.test/fail" }, undefined, undefined, {});
    expect(errorResult.content[0]?.text).toContain("network down");
  });
});
