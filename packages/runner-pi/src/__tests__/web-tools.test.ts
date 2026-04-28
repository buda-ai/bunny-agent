import { afterEach, describe, expect, it } from "vitest";
import {
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
});
