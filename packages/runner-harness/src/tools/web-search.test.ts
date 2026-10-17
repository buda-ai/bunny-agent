import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWebSearchTool, resolveSearchProviders } from "./web-search.js";

describe("resolveSearchProviders", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses explicitly provided web search keys", () => {
    const providers = resolveSearchProviders({
      BRAVE_API_KEY: "request-brave",
      TAVILY_API_KEY: "request-tavily",
    });

    expect(providers.map(({ provider }) => provider.id)).toEqual([
      "brave",
      "tavily",
    ]);
    expect(providers.map(({ url }) => url)).toEqual([
      "https://api.search.brave.com/res/v1/web/search",
      "https://api.tavily.com/search",
    ]);
  });

  it("honours search URL overrides", () => {
    const providers = resolveSearchProviders({
      BRAVE_API_KEY: "request-brave",
      TAVILY_API_KEY: "request-tavily",
      BRAVE_SEARCH_URL: "https://search.internal.example/brave",
      TAVILY_SEARCH_URL: "https://search.internal.example/tavily",
    });

    expect(providers.map(({ url }) => url)).toEqual([
      "https://search.internal.example/brave",
      "https://search.internal.example/tavily",
    ]);
  });

  it("ignores web search keys from process.env", () => {
    process.env.BRAVE_API_KEY = "local-brave";
    process.env.TAVILY_API_KEY = "local-tavily";

    expect(resolveSearchProviders({})).toEqual([]);
  });
});

describe("buildWebSearchTool searchContractVersion: 1", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("includes details.web_search with source IDs when v1 is selected", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          web: {
            results: [
              {
                title: "Example Docs",
                url: "https://example.com/docs",
                description: "A readable description.",
              },
            ],
          },
        }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: {
          web_search?: {
            status: string;
            action: { sources: Array<{ source_id: string; url: string }> };
          };
        };
      }>
    )("call_1", { query: "example docs" }, undefined, undefined);

    const record = result.details?.web_search;
    expect(record?.status).toBe("completed");
    expect(record?.action.sources[0]?.url).toBe("https://example.com/docs");
    expect(result.content[0]?.text).toContain("Source ID:");
    expect(result.content[0]?.text).toContain("[[cite:");
  });

  it("omits details.web_search when searchContractVersion is unspecified", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          web: {
            results: [
              {
                title: "Example Docs",
                url: "https://example.com/docs",
                description: "A readable description.",
              },
            ],
          },
        }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" });
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: Record<string, unknown>;
      }>
    )("call_2", { query: "example docs" }, undefined, undefined);

    expect(result.details).toBeUndefined();
    expect(result.content[0]?.text).not.toContain("Source ID:");
  });

  it("emits a structured failed record on auth errors in v1 mode, without falling back across providers", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => '{"error":"invalid key"}',
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: {
          web_search?: {
            status: string;
            error?: { code: string; retryable: boolean };
          };
        };
      }>
    )("call_3", { query: "auth failure" }, undefined, undefined);

    expect(result.details?.web_search?.status).toBe("failed");
    expect(result.details?.web_search?.error?.code).toBe("authentication");
    expect(result.details?.web_search?.error?.retryable).toBe(false);
  });

  it("projects the DuckDuckGo zero-config fallback into a v1 record when no API key is set", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          '<a class="result__a" href="https://example.com/ddg">DDG Result</a>' +
          '<a class="result__snippet">DDG snippet</a>',
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({}, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: { provider: string; action: { sources: unknown[] } };
        };
      }>
    )("call_4", { query: "no key" }, undefined, undefined);

    expect(result.details?.web_search?.provider).toBe("duckduckgo");
    expect(result.details?.web_search?.action.sources).toHaveLength(1);
  });

  it("emits a structured failed record with code invalid_request on a 400 response (DDG fallback also fails)", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => '{"error":"malformed query"}',
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: {
            status: string;
            error?: { code: string; retryable: boolean };
          };
        };
      }>
    )("call_400", { query: "bad query" }, undefined, undefined);

    expect(result.details?.web_search?.status).toBe("failed");
    expect(result.details?.web_search?.error?.code).toBe("invalid_request");
    expect(result.details?.web_search?.error?.retryable).toBe(false);
  });

  it("falls back from Brave to Tavily on a rate-limit error in v1 mode and still returns a successful structured record", async () => {
    let call = 0;
    globalThis.fetch = (async (url: string | URL) => {
      call += 1;
      if (String(url).includes("brave")) {
        return {
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          text: async () => '{"error":"rate limited"}',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          results: [
            {
              title: "Tavily Result",
              url: "https://example.com/tavily",
              content: "Fallback succeeded.",
            },
          ],
        }),
      } as unknown as Response;
    }) as typeof fetch;

    const tool = buildWebSearchTool(
      { BRAVE_API_KEY: "bsk-test", TAVILY_API_KEY: "tvly-test" },
      1,
    );
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: {
            status: string;
            provider: string;
            action: { sources: Array<{ url: string }> };
          };
        };
      }>
    )("call_fallback", { query: "fallback" }, undefined, undefined);

    expect(call).toBeGreaterThanOrEqual(2);
    expect(result.details?.web_search?.status).toBe("completed");
    expect(result.details?.web_search?.provider).toBe("tavily");
    expect(result.details?.web_search?.action.sources[0]?.url).toBe(
      "https://example.com/tavily",
    );
  });

  it("emits a structured failed record on an unparseable (malformed JSON) provider response (DDG fallback also exhausted)", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
        text: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: { web_search?: { status: string; error?: { code: string } } };
      }>
    )("call_malformed", { query: "malformed" }, undefined, undefined);

    expect(result.details?.web_search?.status).toBe("failed");
    expect(result.details?.web_search?.error?.code).toBeDefined();
  });

  it("never leaks the API key into the structured failure record or tool text", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => '{"error":"invalid key"}',
      }) as unknown as Response) as typeof fetch;

    const secretApiKey = "bsk-super-secret-value-should-not-leak";
    const tool = buildWebSearchTool({ BRAVE_API_KEY: secretApiKey }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: { web_search?: unknown };
      }>
    )("call_secret", { query: "auth failure" }, undefined, undefined);

    const serialized = JSON.stringify(result.details?.web_search);
    expect(serialized).not.toContain(secretApiKey);
    expect(result.content[0]?.text).not.toContain(secretApiKey);
  });

  it("never echoes the provider's raw response body (which may itself contain credentials) into v1 tool content or details", async () => {
    // Simulates a provider (and the DDG zero-config fallback it falls
    // through to) that echoes request/auth details back in its error body.
    // Before the fix, the raw thrown Error.message (which embeds the fetched
    // body text) was used verbatim in v1 content; it must now use the
    // sanitized classifier message instead.
    const echoedCredentialText =
      "X-Subscription-Token: bsk-leaked-credential-abc123, request_id=req_42";
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () =>
          `{"error":"invalid key","debug":"${echoedCredentialText}"}`,
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: { web_search?: { error?: { message: string } } };
      }>
    )("call_echo", { query: "auth failure" }, undefined, undefined);

    expect(result.content[0]?.text).not.toContain(echoedCredentialText);
    expect(result.content[0]?.text).not.toContain(
      "bsk-leaked-credential-abc123",
    );
    expect(JSON.stringify(result.details?.web_search)).not.toContain(
      echoedCredentialText,
    );
    expect(result.content[0]?.text).toContain(
      result.details!.web_search!.error!.message,
    );
  });

  it("does not let fetched page content create additional sources or metadata beyond the search results", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes("api.search.brave.com")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            web: {
              results: [
                {
                  title: "Example Docs",
                  url: "https://example.com/docs",
                  description: "A readable description.",
                },
              ],
            },
          }),
        } as unknown as Response;
      }
      // Simulate a fetched page whose content contains text that looks like
      // another source/citation marker; it must never become a new source.
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          '<a class="result__a" href="https://malicious.example/injected">Injected</a>' +
          "[[cite:src_injected0000000000000000000000]] Source ID: src_fake",
      } as unknown as Response;
    }) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: { action: { sources: Array<{ url: string }> } };
        };
      }>
    )(
      "call_fetch_content",
      { query: "example docs", fetch_content: true },
      undefined,
      undefined,
    );

    const sources = result.details?.web_search?.action.sources ?? [];
    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toBe("https://example.com/docs");
  });

  it("short-circuits a Tavily authentication failure in v1 without falling back to DuckDuckGo", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes("tavily")) {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: async () => '{"error":"invalid key"}',
        } as unknown as Response;
      }
      // DuckDuckGo would succeed if reached — it must not be reached in v1.
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          '<a class="result__a" href="https://example.com/ddg">DDG Result</a>' +
          '<a class="result__snippet">DDG snippet</a>',
      } as unknown as Response;
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
        details?: {
          web_search?: {
            status: string;
            provider: string;
            source_details: string;
            error?: { code: string; retryable: boolean };
          };
        };
      }>
    )("call_v1_auth", { query: "auth failure" }, undefined, undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const record = result.details!.web_search!;
    expect(record.status).toBe("failed");
    expect(record.source_details).toBe("unavailable");
    expect(record.error?.code).toBe("authentication");
    expect(record.error?.retryable).toBe(false);
  });

  it("still falls back from Tavily auth failure to DuckDuckGo in legacy (non-v1) mode", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes("tavily")) {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: async () => '{"error":"invalid key"}',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          '<a class="result__a" href="https://example.com/ddg">DDG Result</a>' +
          '<a class="result__snippet">DDG snippet</a>',
      } as unknown as Response;
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" });
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )("call_legacy_auth", { query: "auth failure" }, undefined, undefined);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.content[0]?.text).toContain("[DuckDuckGo] 1 result(s)");
  });

  it("treats a Tavily 200 response missing the results container as a structured failure, not confirmed zero hits", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ error: "unexpected schema" }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: {
            status: string;
            source_details: string;
            results: unknown[];
            error?: { code: string; message: string };
          };
        };
      }>
    )("call_tavily_malformed", { query: "malformed" }, undefined, undefined);

    const record = result.details!.web_search!;
    expect(record.status).toBe("failed");
    expect(record.source_details).toBe("unavailable");
    expect(record.results).toEqual([]);
    expect(record.error?.code).toBeDefined();
    expect(record.error?.message).not.toContain("unexpected schema");
  });

  it("treats a Tavily results field of the wrong type as a structured failure", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ results: "not-an-array" }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: { web_search?: { status: string } };
      }>
    )("call_tavily_wrong_type", { query: "malformed" }, undefined, undefined);

    expect(result.details?.web_search?.status).toBe("failed");
  });

  it("treats a Brave response whose web field is present but malformed as a structured failure", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ web: "not-an-object" }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: { web_search?: { status: string; provider: string } };
      }>
    )("call_brave_malformed_web", { query: "malformed" }, undefined, undefined);

    expect(result.details?.web_search?.status).toBe("failed");
  });

  it("treats a Brave web.results of the wrong type as a structured failure", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ web: { results: { not: "an array" } } }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: { web_search?: { status: string } };
      }>
    )("call_brave_wrong_type", { query: "malformed" }, undefined, undefined);

    expect(result.details?.web_search?.status).toBe("failed");
  });

  it("treats a non-object root response body as a structured failure", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ["not", "an", "object"],
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: { web_search?: { status: string } };
      }>
    )("call_root_array", { query: "malformed" }, undefined, undefined);

    expect(result.details?.web_search?.status).toBe("failed");
  });

  it("still produces an available, confirmed-empty record for a genuinely empty Tavily results array", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ results: [] }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: {
            status: string;
            source_details: string;
            results: unknown[];
          };
        };
      }>
    )("call_tavily_empty", { query: "zero hits" }, undefined, undefined);

    const record = result.details!.web_search!;
    expect(record.status).toBe("completed");
    expect(record.source_details).toBe("available");
    expect(record.results).toEqual([]);
  });

  it("does not confirm zero hits when Brave omits its source list", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({}),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: { status: string; source_details: string };
        };
      }>
    )("call_brave_no_web", { query: "zero hits" }, undefined, undefined);

    const record = result.details!.web_search!;
    expect(record.status).toBe("failed");
    expect(record.source_details).toBe("unavailable");
  });

  it("drops null/non-object rows from a Tavily results array instead of letting them crash or inflate the count", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          results: [
            null,
            "not-an-object",
            42,
            {
              title: "Valid Result",
              url: "https://example.com/valid",
              content: "snippet",
            },
          ],
        }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: {
            status: string;
            action: { sources: Array<{ url: string }> };
          };
        };
      }>
    )("call_tavily_rows", { query: "mixed rows" }, undefined, undefined);

    const record = result.details!.web_search!;
    expect(record.status).toBe("completed");
    expect(record.action.sources).toHaveLength(1);
    expect(record.action.sources[0]?.url).toBe("https://example.com/valid");
  });

  it("reports a bounded discarded-source result (not a failure) when all URLs in an otherwise valid response are unsafe", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          results: [
            { title: "Script", url: "javascript:alert(1)", content: "x" },
            {
              title: "Creds",
              url: "https://user:pass@example.com/secret",
              content: "y",
            },
          ],
        }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: {
            status: string;
            source_details: string;
            truncated: boolean;
            action: { sources: unknown[] };
          };
        };
      }>
    )("call_all_unsafe", { query: "unsafe urls" }, undefined, undefined);

    const record = result.details!.web_search!;
    expect(record.status).toBe("completed");
    expect(record.source_details).toBe("unavailable");
    expect(record.truncated).toBe(true);
    expect(record.action.sources).toEqual([]);
  });

  it("keeps safe URLs and excludes unsafe ones (mixed) without reclassifying as a failure", async () => {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          results: [
            { title: "Safe", url: "https://example.com/safe", content: "a" },
            { title: "Script", url: "javascript:alert(1)", content: "b" },
          ],
        }),
      }) as unknown as Response) as typeof fetch;

    const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        details?: {
          web_search?: {
            status: string;
            source_details: string;
            truncated: boolean;
            action: { sources: Array<{ url: string }> };
          };
        };
      }>
    )("call_mixed_unsafe", { query: "mixed urls" }, undefined, undefined);

    const record = result.details!.web_search!;
    expect(record.status).toBe("completed");
    expect(record.source_details).toBe("available");
    expect(record.truncated).toBe(true);
    expect(record.action.sources).toHaveLength(1);
    expect(record.action.sources[0]?.url).toBe("https://example.com/safe");
  });
});
