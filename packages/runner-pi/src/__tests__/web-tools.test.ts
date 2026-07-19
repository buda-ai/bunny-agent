import { afterEach, describe, expect, it, vi } from "vitest";
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
    vi.restoreAllMocks();
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

  it("reports the provider and nested fetch cause", async () => {
    const cause = Object.assign(
      new Error("connect ETIMEDOUT 203.0.113.1:443"),
      {
        code: "ETIMEDOUT",
        errno: -60,
        syscall: "connect",
        hostname: "api.tavily.com",
        address: "203.0.113.1",
        port: 443,
      },
    );
    const fetchError = Object.assign(new TypeError("fetch failed"), { cause });
    globalThis.fetch = (async () => {
      throw fetchError;
    }) as typeof fetch;
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" });
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )("call_2", { query: "NVDA historical data" }, undefined, undefined, {});

    expect(result.content[0]?.text).toContain(
      "Web search error (Tavily): TypeError: fetch failed (cause: code=ETIMEDOUT",
    );
    expect(result.content[0]?.text).toContain("hostname=api.tavily.com");
    expect(result.content[0]?.text).toContain("port=443");
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining(
        "[bunny-agent:pi] Tavily web_search failed: TypeError: fetch failed (cause: code=ETIMEDOUT",
      ),
    );
  });

  it("preserves HTTP provider error details", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 432,
        statusText: "Request Failed",
        text: async () => '{"detail":"usage limit exceeded"}',
      }) as unknown as Response) as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" });
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )("call_3", { query: "NVDA historical data" }, undefined, undefined, {});

    expect(result.content[0]?.text).toContain(
      "Web search error (Tavily): Tavily API 432: Request Failed",
    );
    expect(result.content[0]?.text).toContain("usage limit exceeded");
  });

  it.each([
    "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT",
    "ETIMEDOUT",
    "ENETUNREACH",
  ])("falls back from Brave to Tavily on %s", async (code) => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).startsWith("https://api.search.brave.com/")) {
        const cause = Object.assign(new Error(`network failure: ${code}`), {
          code,
        });
        throw Object.assign(new TypeError("fetch failed"), { cause });
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          results: [
            {
              title: "Fallback result",
              url: "https://example.com/fallback",
              content: "Tavily completed the search.",
            },
          ],
        }),
      } as Response;
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const tool = buildWebSearchTool({
      BRAVE_API_KEY: "bsk-test",
      TAVILY_API_KEY: "tvly-test",
    });
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: unknown;
      }>
    )("call_fallback", { query: "fallback query" }, undefined, undefined, {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.content[0]?.text).toContain("[Tavily] 1 result(s)");
    expect(result.details).toMatchObject({
      usage: { raw: { tavily: { requests: 1, fetchedPages: 0 } } },
    });
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("Brave Search network error, trying Tavily"),
    );
  });

  it("does not fall back on provider authentication errors", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: async () => '{"error":"invalid key"}',
        }) as Response,
    );
    globalThis.fetch = fetchMock as typeof fetch;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const tool = buildWebSearchTool({
      BRAVE_API_KEY: "bsk-test",
      TAVILY_API_KEY: "tvly-test",
    });
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )("call_auth", { query: "auth query" }, undefined, undefined, {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.content[0]?.text).toContain(
      "Web search error (Brave Search): Brave API 401: Unauthorized",
    );
  });
});

describe("buildWebFetchTool", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("reports nested fetch cause and logs only the target origin", async () => {
    const cause = Object.assign(new Error("socket disconnected"), {
      code: "UND_ERR_SOCKET",
    });
    globalThis.fetch = (async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause });
    }) as typeof fetch;
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const tool = buildWebFetchTool();
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )(
      "call_4",
      { url: "https://example.com/article" },
      undefined,
      undefined,
      {},
    );

    expect(result.content[0]?.text).toContain(
      "TypeError: fetch failed (cause: code=UND_ERR_SOCKET, message=socket disconnected)",
    );
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining(
        "web_fetch failed target=https://example.com: TypeError: fetch failed",
      ),
    );
  });
});
