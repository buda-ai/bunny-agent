import {
  isValidWebSearchCallRecord,
  type WebSearchCallRecord,
} from "@bunny-agent/manager/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWebSearchTool as harnessSearch } from "../../runner-harness/src/tools/web-search.js";
import { buildWebSearchTool as nativeSearch } from "../src/web-tools.js";

type Provider = "brave" | "tavily";
type Factory = typeof nativeSearch | typeof harnessSearch;
interface Result {
  content: Array<{ text?: string }>;
  details?: { web_search?: WebSearchCallRecord };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function execute(
  factory: Factory,
  provider: Provider,
  body: unknown,
  version?: 1,
) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const env: Record<string, string> =
    provider === "brave"
      ? { BRAVE_API_KEY: "fake-brave-key" }
      : { TAVILY_API_KEY: "fake-tavily-key" };
  const tool = factory(env, version);
  if (!tool) throw new Error("Expected a configured search tool.");
  const run = tool.execute as unknown as (
    ...args: unknown[]
  ) => Promise<Result>;
  const result = await run(
    "call-provider-contract",
    { query: "same query", count: 10 },
    undefined,
    undefined,
    {},
  );
  if (version === 1)
    expect(isValidWebSearchCallRecord(result.details?.web_search)).toBe(true);
  return { result, fetch, record: result.details?.web_search };
}
function payload(provider: Provider, rows: unknown[]) {
  return provider === "brave" ? { web: { results: rows } } : { results: rows };
}

describe.each([
  ["native Pi", nativeSearch],
  ["harness", harnessSearch],
] as const)("%s provider response contract", (_name, factory) => {
  it.each([
    "brave",
    "tavily",
  ] as const)("rejects missing %s source lists without hiding them behind fallback", async (provider) => {
    const { record, result, fetch } = await execute(
      factory,
      provider,
      { error: "body-echo-credential-fixture" },
      1,
    );
    expect(record?.status).toBe("failed");
    expect(record?.source_details).toBe("unavailable");
    expect(record?.error).toEqual({
      code: "provider_error",
      message: "Web search provider failed.",
      retryable: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain(
      "body-echo-credential-fixture",
    );
  });
  it.each([
    "brave",
    "tavily",
  ] as const)("retains legacy %s missing-list behavior", async (provider) => {
    const { result, record, fetch } = await execute(factory, provider, {});
    expect(record).toBeUndefined();
    expect(result.content[0]?.text).toContain("No results found.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    "brave",
    "tavily",
  ] as const)("keeps discarded %s rows distinct from confirmed empty results", async (provider) => {
    const { record, result } = await execute(
      factory,
      provider,
      payload(provider, [null, "not a result", 42]),
      1,
    );
    expect(record?.status).toBe("completed");
    expect(record?.source_details).toBe("unavailable");
    expect(record?.results).toEqual([]);
    expect(record?.truncated).toBe(true);
    expect(result.content[0]?.text).toContain("source details are unavailable");
    expect(result.content[0]?.text).not.toContain("No results found.");
  });
  it.each([
    "brave",
    "tavily",
  ] as const)("marks discarded mixed %s rows while retaining valid sources", async (provider) => {
    const rows = [
      null,
      {
        title: "Valid",
        url: "https://example.com/valid",
        description: "Snippet",
        content: "Snippet",
      },
      "invalid",
      { title: "Unsafe", url: "javascript:alert(1)" },
    ];
    const { record, result } = await execute(
      factory,
      provider,
      payload(provider, rows),
      1,
    );
    expect(record?.status).toBe("completed");
    expect(record?.source_details).toBe("available");
    expect(record?.truncated).toBe(true);
    expect(record?.action.sources).toHaveLength(1);
    expect(record?.results[0]?.url).toBe("https://example.com/valid");
    expect(result.content[0]?.text).not.toContain("javascript:");
  });
  it.each([
    "brave",
    "tavily",
  ] as const)("accepts explicit empty %s arrays as confirmed zero hits", async (provider) => {
    const { record, result } = await execute(
      factory,
      provider,
      payload(provider, []),
      1,
    );
    expect(record?.status).toBe("completed");
    expect(record?.source_details).toBe("available");
    expect(record?.results).toEqual([]);
    expect(record?.truncated).toBe(false);
    expect(result.content[0]?.text).toContain("No results found.");
  });
});
it.each([
  "brave",
  "tavily",
] as const)("produces equivalent Pi/harness canonical %s data", async (provider) => {
  const body = payload(provider, [
    {
      title: "Same source",
      url: "https://example.com/docs?q=1#section",
      description: "Snippet",
      content: "Snippet",
      age: "today",
    },
  ]);
  const pi = await execute(nativeSearch, provider, body, 1);
  const harness = await execute(harnessSearch, provider, body, 1);
  expect(pi.record).toEqual(harness.record);
});
