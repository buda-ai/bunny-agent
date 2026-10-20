import { afterEach, describe, expect, it, vi } from "vitest";
import { sourceReference } from "../source-registry.js";
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

  it("ignores BRAVE_API_KEY from process.env", () => {
    process.env.BRAVE_API_KEY = "env-brave";
    const result = resolveSearchProviders({});
    expect(result).toEqual([]);
  });

  it("ignores TAVILY_API_KEY from process.env", () => {
    process.env.TAVILY_API_KEY = "env-tavily";
    const result = resolveSearchProviders({});
    expect(result).toEqual([]);
  });

  it("uses the explicitly provided env map instead of process.env", () => {
    process.env.BRAVE_API_KEY = "env-brave";
    const result = resolveSearchProviders({ BRAVE_API_KEY: "param-brave" });
    expect(result[0].apiKey).toBe("param-brave");
  });

  it("ignores empty string keys", () => {
    const result = resolveSearchProviders({ BRAVE_API_KEY: "" });
    expect(result).toEqual([]);
  });

  it("uses vendor default URLs when no override is set", () => {
    const result = resolveSearchProviders({
      BRAVE_API_KEY: "bsk-123",
      TAVILY_API_KEY: "tvly-456",
    });
    expect(result[0].url).toBe(
      "https://api.search.brave.com/res/v1/web/search",
    );
    expect(result[1].url).toBe("https://api.tavily.com/search");
  });

  it("honours BRAVE_SEARCH_URL override", () => {
    const result = resolveSearchProviders({
      BRAVE_API_KEY: "bsk-123",
      BRAVE_SEARCH_URL: "https://search.internal.example/brave",
    });
    expect(result[0].url).toBe("https://search.internal.example/brave");
  });

  it("honours TAVILY_SEARCH_URL override", () => {
    const result = resolveSearchProviders({
      TAVILY_API_KEY: "tvly-456",
      TAVILY_SEARCH_URL: "https://search.internal.example/tavily",
    });
    expect(result[0].url).toBe("https://search.internal.example/tavily");
  });

  it("ignores empty URL overrides and keeps the vendor default", () => {
    const result = resolveSearchProviders({
      BRAVE_API_KEY: "bsk-123",
      BRAVE_SEARCH_URL: "",
    });
    expect(result[0].url).toBe(
      "https://api.search.brave.com/res/v1/web/search",
    );
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

  describe("searchContractVersion: 1", () => {
    afterEach(() => {
      process.env = { ...originalEnv };
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it.each([
      "brave",
      "tavily",
    ] as const)("keeps canonical IDs in %s details and exposes only compact References in readable content", async (provider) => {
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
                  age: "1 day ago",
                },
              ],
            },
            results: [
              {
                title: "Example Docs",
                url: "https://example.com/docs",
                content: "A readable description.",
              },
            ],
          }),
          text: async () => "",
        }) as unknown as Response) as typeof fetch;

      const tool = buildWebSearchTool(
        provider === "brave"
          ? { BRAVE_API_KEY: "fixture" }
          : { TAVILY_API_KEY: "fixture" },
        1,
      );
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          content: Array<{ type: string; text?: string }>;
          details?: {
            usage?: unknown;
            web_search?: {
              schema_version: number;
              status: string;
              source_details: string;
              action: { sources: Array<{ source_id: string; url: string }> };
              results: Array<{ source_id: string }>;
            };
          };
        }>
      )(
        "call_v1_1",
        { query: "example docs", count: 1 },
        undefined,
        undefined,
        {},
      );

      expect(result.details?.web_search).toBeDefined();
      const record = result.details!.web_search!;
      expect(record.schema_version).toBe(1);
      expect(record.status).toBe("completed");
      expect(record.source_details).toBe("available");
      expect(record.action.sources).toHaveLength(1);
      expect(record.action.sources[0].url).toBe("https://example.com/docs");
      expect(record.results[0].source_id).toBe(
        record.action.sources[0].source_id,
      );
      expect(record.results[0].source_id).toMatch(/^src_[a-f0-9]{64}$/);

      expect(result.content[0]?.text).toContain(
        `Reference: ${sourceReference(record.action.sources[0].source_id)}`,
      );
      expect(result.content[0]?.text).not.toContain(
        record.action.sources[0].source_id,
      );
      expect(result.content[0]?.text).toContain("[[cite:");
      expect(result.details?.usage).toMatchObject({
        raw: { [provider]: { requests: 1, fetchedPages: 0 } },
      });
    });

    it("produces an available-but-empty record for zero hits, not a false error", async () => {
      globalThis.fetch = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ web: { results: [] } }),
          text: async () => "",
        }) as unknown as Response) as typeof fetch;

      const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          content: Array<{ type: string; text?: string }>;
          details?: {
            web_search?: {
              status: string;
              source_details: string;
              action: { sources: unknown[] };
              results: unknown[];
            };
          };
        }>
      )("call_v1_2", { query: "no hits" }, undefined, undefined, {});

      const record = result.details!.web_search!;
      expect(record.status).toBe("completed");
      expect(record.source_details).toBe("available");
      expect(record.action.sources).toEqual([]);
      expect(record.results).toEqual([]);
      expect(result.content[0]?.text).toBe("No results found.");
    });

    it("retains age and fetched content on structured result items", async () => {
      globalThis.fetch = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            web: {
              results: [
                {
                  title: "Recent",
                  url: "https://example.com/recent",
                  description: "snippet",
                  age: "2 hours ago",
                },
              ],
            },
          }),
          text: async () => "<html><body>page body</body></html>",
        }) as unknown as Response) as typeof fetch;

      const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          details?: {
            web_search?: { results: Array<{ age?: string; content?: string }> };
          };
        }>
      )(
        "call_v1_3",
        { query: "recent", fetch_content: true },
        undefined,
        undefined,
        {},
      );

      expect(result.details?.web_search?.results[0].age).toBe("2 hours ago");
      expect(result.details?.web_search?.results[0].content).toContain(
        "page body",
      );
    });

    it("emits a structured failed record on fallback-exhausted provider identity (not a default provider id)", async () => {
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

      const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          content: Array<{ type: string; text?: string }>;
          details?: {
            web_search?: {
              status: string;
              source_details: string;
              provider: string;
              error?: { code: string; retryable: boolean };
            };
          };
        }>
      )("call_v1_4", { query: "auth failure" }, undefined, undefined, {});

      const record = result.details!.web_search!;
      expect(record.status).toBe("failed");
      expect(record.source_details).toBe("unavailable");
      expect(record.provider).toBe("Brave Search");
      expect(record.error?.code).toBe("authentication");
      expect(record.error?.retryable).toBe(false);
      expect(result.content[0]?.text).toContain(
        "Web search error (Brave Search)",
      );
    });

    it("omits details.web_search entirely when searchContractVersion is unspecified (legacy unchanged)", async () => {
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
          text: async () => "",
        }) as unknown as Response) as typeof fetch;

      const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" });
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          content: Array<{ type: string; text?: string }>;
          details?: Record<string, unknown>;
        }>
      )("call_legacy", { query: "example docs" }, undefined, undefined, {});

      expect(result.details).not.toHaveProperty("web_search");
      expect(result.content[0]?.text).not.toContain("Source ID:");
      expect(result.content[0]?.text).not.toContain("[[cite:");
    });

    it("emits a structured failed record with code invalid_request on a 400 response with no fallback provider left", async () => {
      globalThis.fetch = (async () =>
        ({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          text: async () => '{"error":"malformed query"}',
        }) as unknown as Response) as typeof fetch;
      vi.spyOn(console, "error").mockImplementation(() => undefined);

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
      )("call_400", { query: "bad query" }, undefined, undefined, {});

      const record = result.details!.web_search!;
      expect(record.status).toBe("failed");
      expect(record.error?.code).toBe("invalid_request");
      expect(record.error?.retryable).toBe(false);
    });

    it("emits a structured failed record with code rate_limit on a 429 response with no fallback provider left", async () => {
      globalThis.fetch = (async () =>
        ({
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          text: async () => '{"error":"rate limited"}',
        }) as unknown as Response) as typeof fetch;
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      // Only one provider configured, so the rate-limit fallback path has
      // nowhere to go and the failure must surface as a structured record.
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
      )("call_429", { query: "too many" }, undefined, undefined, {});

      const record = result.details!.web_search!;
      expect(record.status).toBe("failed");
      expect(record.error?.code).toBe("rate_limit");
      expect(record.error?.retryable).toBe(true);
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
      vi.spyOn(console, "error").mockImplementation(() => undefined);

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
      )("call_fallback", { query: "fallback" }, undefined, undefined, {});

      expect(call).toBeGreaterThanOrEqual(2);
      const record = result.details!.web_search!;
      expect(record.status).toBe("completed");
      expect(record.provider).toBe("tavily");
      expect(record.action.sources[0]?.url).toBe("https://example.com/tavily");
    });

    it("emits a structured failed record on an unparseable (malformed JSON) provider response", async () => {
      globalThis.fetch = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => {
            throw new SyntaxError("Unexpected token in JSON");
          },
          text: async () => "not json",
        }) as unknown as Response) as typeof fetch;
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          details?: {
            web_search?: { status: string; error?: { code: string } };
          };
        }>
      )("call_malformed", { query: "malformed" }, undefined, undefined, {});

      const record = result.details!.web_search!;
      expect(record.status).toBe("failed");
      expect(record.error?.code).toBeDefined();
    });

    it("never leaks the API key into the structured failure record or tool text", async () => {
      globalThis.fetch = (async () =>
        ({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: async () => '{"error":"invalid key"}',
        }) as unknown as Response) as typeof fetch;
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const secretApiKey = "bsk-super-secret-value-should-not-leak";
      const tool = buildWebSearchTool({ BRAVE_API_KEY: secretApiKey }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          content: Array<{ type: string; text?: string }>;
          details?: { web_search?: unknown };
        }>
      )("call_secret", { query: "auth failure" }, undefined, undefined, {});

      const serialized = JSON.stringify(result.details?.web_search);
      expect(serialized).not.toContain(secretApiKey);
      expect(result.content[0]?.text).not.toContain(secretApiKey);
    });

    it("never echoes the provider's raw response body (which may itself contain credentials) into v1 tool content or details", async () => {
      // Simulates a provider that echoes request/auth details back in its
      // error body — formatWebToolError() would normally fold this into the
      // thrown Error's message via `Brave API 401: Unauthorized\n${body}`.
      // v1 content must use the sanitized classifier message instead.
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
      const errorLog = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          content: Array<{ type: string; text?: string }>;
          details?: { web_search?: { error?: { message: string } } };
        }>
      )("call_echo", { query: "auth failure" }, undefined, undefined, {});

      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
        echoedCredentialText,
      );
      expect(result.content[0]?.text).not.toContain(echoedCredentialText);
      expect(result.content[0]?.text).not.toContain(
        "bsk-leaked-credential-abc123",
      );
      expect(JSON.stringify(result.details?.web_search)).not.toContain(
        echoedCredentialText,
      );
      // The sanitized classifier message is what callers should see instead.
      expect(result.content[0]?.text).toContain(
        result.details!.web_search!.error!.message,
      );
    });

    it("short-circuits a Brave authentication failure in v1 without falling back to Tavily", async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes("api.search.brave.com")) {
          return {
            ok: false,
            status: 401,
            statusText: "Unauthorized",
            text: async () => '{"error":"invalid key"}',
          } as Response;
        }
        // Tavily would succeed if reached — it must not be reached in v1.
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({
            results: [
              {
                title: "Tavily Result",
                url: "https://example.com/tavily",
                content: "Should not be reached.",
              },
            ],
          }),
        } as Response;
      });
      globalThis.fetch = fetchMock as typeof fetch;
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const tool = buildWebSearchTool(
        { BRAVE_API_KEY: "bsk-test", TAVILY_API_KEY: "tvly-test" },
        1,
      );
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          details?: {
            web_search?: {
              status: string;
              source_details: string;
              error?: { code: string; retryable: boolean };
            };
          };
        }>
      )(
        "call_v1_auth_no_fallback",
        { query: "auth" },
        undefined,
        undefined,
        {},
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const record = result.details!.web_search!;
      expect(record.status).toBe("failed");
      expect(record.source_details).toBe("unavailable");
      expect(record.error?.code).toBe("authentication");
      expect(record.error?.retryable).toBe(false);
    });

    it("treats a Tavily 200 response missing the results container as a structured failure, not confirmed zero hits", async () => {
      globalThis.fetch = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ error: "unexpected schema" }),
        }) as unknown as Response) as typeof fetch;
      vi.spyOn(console, "error").mockImplementation(() => undefined);

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
      )(
        "call_tavily_malformed",
        { query: "malformed" },
        undefined,
        undefined,
        {},
      );

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
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          details?: { web_search?: { status: string } };
        }>
      )(
        "call_tavily_wrong_type",
        { query: "malformed" },
        undefined,
        undefined,
        {},
      );

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
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          details?: { web_search?: { status: string } };
        }>
      )(
        "call_brave_malformed_web",
        { query: "malformed" },
        undefined,
        undefined,
        {},
      );

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
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const tool = buildWebSearchTool({ BRAVE_API_KEY: "bsk-test" }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          details?: { web_search?: { status: string } };
        }>
      )(
        "call_brave_wrong_type",
        { query: "malformed" },
        undefined,
        undefined,
        {},
      );

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
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
      const result = await (
        tool.execute as (...args: unknown[]) => Promise<{
          details?: { web_search?: { status: string } };
        }>
      )("call_root_array", { query: "malformed" }, undefined, undefined, {});

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
      )("call_tavily_empty", { query: "zero hits" }, undefined, undefined, {});

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
          details?: { web_search?: { status: string; source_details: string } };
        }>
      )("call_brave_no_web", { query: "zero hits" }, undefined, undefined, {});

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
      )("call_tavily_rows", { query: "mixed rows" }, undefined, undefined, {});

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
      )("call_all_unsafe", { query: "unsafe urls" }, undefined, undefined, {});

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
      )("call_mixed_unsafe", { query: "mixed urls" }, undefined, undefined, {});

      const record = result.details!.web_search!;
      expect(record.status).toBe("completed");
      expect(record.source_details).toBe("available");
      expect(record.truncated).toBe(true);
      expect(record.action.sources).toHaveLength(1);
      expect(record.action.sources[0]?.url).toBe("https://example.com/safe");
    });

    it("never logs the raw malformed-schema body text to the console diagnostic", async () => {
      const echoedBody =
        '{"error":"unexpected schema","debug":"leak-marker-xyz"}';
      globalThis.fetch = (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => JSON.parse(echoedBody),
        }) as unknown as Response) as typeof fetch;
      const errorLog = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const tool = buildWebSearchTool({ TAVILY_API_KEY: "tvly-test" }, 1);
      await (tool.execute as (...args: unknown[]) => Promise<unknown>)(
        "call_malformed_log",
        { query: "malformed" },
        undefined,
        undefined,
        {},
      );

      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
        "leak-marker-xyz",
      );
    });
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

  it("routes Brave requests through BRAVE_SEARCH_URL", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request) =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ web: { results: [] } }),
          text: async () => "",
        }) as unknown as Response,
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const tool = buildWebSearchTool({
      BRAVE_API_KEY: "bsk-test",
      BRAVE_SEARCH_URL: "https://search.internal.example/brave",
    });
    await (tool.execute as (...args: unknown[]) => Promise<unknown>)(
      "call_base",
      { query: "override query" },
      undefined,
      undefined,
      {},
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://search.internal.example/brave?q=override+query&count=5&country=US",
    );
  });

  it("routes Tavily requests through TAVILY_SEARCH_URL", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request) =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ results: [] }),
          text: async () => "",
        }) as unknown as Response,
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const tool = buildWebSearchTool({
      TAVILY_API_KEY: "tvly-test",
      TAVILY_SEARCH_URL: "https://search.internal.example/tavily",
    });
    await (tool.execute as (...args: unknown[]) => Promise<unknown>)(
      "call_base",
      { query: "override query" },
      undefined,
      undefined,
      {},
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://search.internal.example/tavily",
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
