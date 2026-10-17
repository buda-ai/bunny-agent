/**
 * Web search tool — pluggable providers (Brave, Tavily).
 * Provider auto-detected from env keys; Brave preferred over Tavily.
 */
import {
  buildWebSearchCallRecord,
  buildWebSearchFailureRecord,
  classifyWebSearchError,
} from "@bunny-agent/manager/contracts/record";
import type {
  SearchResult,
  ToolDefinition,
  WebSearchToolDetails,
} from "./types.js";

export type { SearchResult };

export interface WebSearchProvider {
  id: string;
  label: string;
  envKeys: string[];
  /** Env var holding a full request-URL override. Falls back to `defaultUrl`. */
  urlEnvKey: string;
  /** Vendor endpoint used when `urlEnvKey` is unset. */
  defaultUrl: string;
  search(params: {
    apiKey: string | undefined;
    url: string;
    query: string;
    count: number;
    country?: string;
    freshness?: string;
    searchContractVersion?: 1;
  }): Promise<SearchResult[]>;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/**
 * A thrown provider-shape error that must classify as a safe, non-retryable
 * `provider_error` rather than surface any raw body text. Distinct from an
 * HTTP failure: the request succeeded, but the body cannot be trusted to
 * mean "zero hits" because it does not match the provider's documented
 * response shape.
 */
class MalformedProviderResponseError extends Error {
  constructor(provider: string) {
    super(
      `${provider} returned a response that does not match the expected schema.`,
    );
    this.name = "MalformedProviderResponseError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateProviderResults(
  data: unknown,
  provider: "Brave" | "Tavily",
): void {
  if (!isPlainObject(data)) throw new MalformedProviderResponseError(provider);
  const rows =
    provider === "Brave"
      ? isPlainObject(data.web)
        ? data.web.results
        : undefined
      : data.results;
  // Missing source details do not establish a confirmed zero-hit search.
  if (!Array.isArray(rows)) throw new MalformedProviderResponseError(provider);
}

const braveProvider: WebSearchProvider = {
  id: "brave",
  label: "Brave Search",
  envKeys: ["BRAVE_API_KEY"],
  urlEnvKey: "BRAVE_SEARCH_URL",
  defaultUrl: "https://api.search.brave.com/res/v1/web/search",
  async search({
    apiKey,
    url,
    query,
    count,
    country,
    freshness,
    searchContractVersion,
  }) {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(count, 20)),
    });
    if (country) params.set("country", country);
    if (freshness) params.set("freshness", freshness);
    const res = await fetch(`${url}?${params}`, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey!,
      },
    });
    if (!res.ok)
      throw new Error(
        `Brave API ${res.status}: ${await res.text().catch(() => "")}`,
      );
    // biome-ignore lint/suspicious/noExplicitAny: Brave API response
    const data: any = await res.json();
    if (searchContractVersion === 1) validateProviderResults(data, "Brave");
    const results: SearchResult[] = [];
    for (const r of data.web?.results ?? []) {
      if (results.length >= count) break;
      if (searchContractVersion === 1 && !isPlainObject(r)) {
        results.push({ title: "", link: "", snippet: "" });
        continue;
      }
      results.push({
        title: r.title ?? "",
        link: r.url ?? "",
        snippet: r.description ?? "",
        age: r.age ?? r.page_age ?? "",
      });
    }
    return results;
  },
};

const tavilyProvider: WebSearchProvider = {
  id: "tavily",
  label: "Tavily",
  envKeys: ["TAVILY_API_KEY"],
  urlEnvKey: "TAVILY_SEARCH_URL",
  defaultUrl: "https://api.tavily.com/search",
  async search({ apiKey, url, query, count, searchContractVersion }) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(count, 10),
        include_answer: false,
      }),
    });
    if (!res.ok)
      throw new Error(
        `Tavily API ${res.status}: ${await res.text().catch(() => "")}`,
      );
    // biome-ignore lint/suspicious/noExplicitAny: Tavily API response
    const data: any = await res.json();
    if (searchContractVersion === 1) validateProviderResults(data, "Tavily");
    // biome-ignore lint/suspicious/noExplicitAny: Tavily API response item
    return (data.results ?? []).map((r: any) => {
      if (searchContractVersion === 1 && !isPlainObject(r))
        return { title: "", link: "", snippet: "" };
      return {
        title: r.title ?? "",
        link: r.url ?? "",
        snippet: r.content ?? "",
      };
    });
  },
};

const AUTO_DETECT_ORDER = [braveProvider, tavilyProvider];

// ---------------------------------------------------------------------------
// DuckDuckGo zero-config fallback (HTML scrape, no API key)
// ---------------------------------------------------------------------------

async function duckduckgoSearch(
  query: string,
  count: number,
): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`DDG ${res.status}`);
  const html = await res.text();
  const results: SearchResult[] = [];
  const linkRe =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const links: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex loop
  while ((m = linkRe.exec(html)) !== null && links.length < count) {
    const uddg = m[1].match(/uddg=([^&]+)/)?.[1];
    const link = uddg ? decodeURIComponent(uddg) : m[1];
    if (!link.startsWith("http")) continue;
    links.push({ url: link, title: m[2].replace(/<[^>]+>/g, "").trim() });
  }
  const snippets: string[] = [];
  // biome-ignore lint/suspicious/noAssignInExpressions: regex loop
  while ((m = snippetRe.exec(html)) !== null)
    snippets.push(m[1].replace(/<[^>]+>/g, "").trim());
  for (let i = 0; i < Math.min(links.length, count); i++) {
    results.push({
      title: links[i].title,
      link: links[i].url,
      snippet: snippets[i] ?? "",
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

interface ResolvedProvider {
  provider: WebSearchProvider;
  apiKey: string;
  /** Full request URL from env, or the provider default when unset. */
  url: string;
}

function getEnv(env: Record<string, string>, key: string): string | undefined {
  const v = env[key];
  return v && v.length > 0 ? v : undefined;
}

export function resolveSearchProviders(
  env: Record<string, string>,
): ResolvedProvider[] {
  const available: ResolvedProvider[] = [];
  for (const p of AUTO_DETECT_ORDER) {
    for (const key of p.envKeys) {
      const val = getEnv(env, key);
      if (val) {
        available.push({
          provider: p,
          apiKey: val,
          url: getEnv(env, p.urlEnvKey) ?? p.defaultUrl,
        });
        break;
      }
    }
  }
  return available;
}

export function resolveSearchProvider(
  env: Record<string, string>,
): ResolvedProvider | null {
  const all = resolveSearchProviders(env);
  return all.length > 0 ? all[0] : null;
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes("429") ||
    err.message.includes("rate") ||
    err.message.includes("quota")
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchPageContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!res.ok) return `(HTTP ${res.status}: ${res.statusText})`;
    const text = htmlToText(await res.text());
    return text.length > 50_000
      ? `${text.slice(0, 50_000)}\n\n[Truncated]`
      : text;
  } catch (e: unknown) {
    return `(Error fetching ${url}: ${e instanceof Error ? e.message : String(e)})`;
  } finally {
    clearTimeout(timeout);
  }
}

function formatResults(
  results: SearchResult[],
  label: string,
  sourceIds?: string[],
): string {
  if (results.length === 0) return "No results found.";
  return (
    `[${label}] ${results.length} result(s)\n` +
    results
      .map((r, i) => {
        const lines = [`--- Result ${i + 1} ---`];
        if (sourceIds?.[i]) lines.push(`Source ID: ${sourceIds[i]}`);
        lines.push(`Title: ${r.title}`, `Link: ${r.link}`);
        if (r.age) lines.push(`Age: ${r.age}`);
        lines.push(`Snippet: ${r.snippet}`);
        if (r.content) lines.push(`Content:\n${r.content}`);
        return lines.join("\n");
      })
      .join("\n\n")
  );
}

/**
 * Appended to v1-mode `web_search` results: instructs the model to use the
 * explicit `[[cite:<source_id>]]` marker bridge immediately after a
 * supported statement. Only included when `searchContractVersion: 1` is
 * selected — legacy output is unaffected.
 */
const V1_CITATION_INSTRUCTION =
  "\n\nTo cite a result above in your answer, write [[cite:<Source ID>]] " +
  "immediately after the statement it supports, using the exact Source ID shown.";

// ---------------------------------------------------------------------------
// Tool builder
// ---------------------------------------------------------------------------

export function buildWebSearchTool(
  env: Record<string, string>,
  searchContractVersion?: 1,
): ToolDefinition {
  const providers = resolveSearchProviders(env);
  const v1 = searchContractVersion === 1;

  return {
    name: "web_search",
    label: "web search",
    description: "Search the web. Returns titles, URLs, and snippets.",
    promptSnippet:
      "web_search(query, count?, freshness?, country?, fetch_content?)",
    promptGuidelines: [
      "Use for current info, docs, or facts not available locally.",
      "Set fetch_content=true only when you need full page text — it is slower.",
      ...(v1
        ? [
            "When citing a web_search result in your answer, write [[cite:<Source ID>]] immediately after the supported statement.",
          ]
        : []),
    ],
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        count: { type: "number", description: "Default 5, max 20" },
        freshness: {
          type: "string",
          description: '"pd","pw","pm","py" or date range',
        },
        country: { type: "string", description: "Two-letter country code" },
        fetch_content: { type: "boolean" },
      },
    },
    async execute(toolCallId, params, _signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const query = p.query as string;
      const count = (p.count as number) ?? 5;
      const country = (p.country as string) ?? "US";
      const freshness = p.freshness as string | undefined;
      const shouldFetch = (p.fetch_content as boolean) ?? false;

      let lastError: unknown;
      let lastProviderLabel = "unknown provider";
      let terminalFailureInV1 = false;
      for (const { provider, apiKey, url } of providers) {
        lastProviderLabel = provider.label;
        try {
          const results = await provider.search({
            apiKey,
            url,
            query,
            count,
            country,
            freshness,
            ...(v1 ? { searchContractVersion: 1 as const } : {}),
          });
          if (shouldFetch)
            for (const r of results) r.content = await fetchPageContent(r.link);

          if (!v1) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: formatResults(results, provider.label),
                },
              ],
              details: undefined,
            };
          }
          return buildV1SuccessResult(toolCallId, query, provider.id, results);
        } catch (e) {
          lastError = e;
          // Keep v1 authentication/schema failures visible. Legacy fallback
          // and recoverable rate/network behavior retain their existing policy.
          if (
            v1 &&
            (classifyWebSearchError(e).code === "authentication" ||
              e instanceof MalformedProviderResponseError ||
              e instanceof SyntaxError)
          ) {
            terminalFailureInV1 = true;
            break;
          }
          if (isRateLimitError(e) && providers.length > 1) continue;
          break;
        }
      }

      if (!terminalFailureInV1) {
        // DDG zero-config fallback
        lastProviderLabel = "DuckDuckGo";
        try {
          const results = await duckduckgoSearch(query, count);
          if (shouldFetch)
            for (const r of results) r.content = await fetchPageContent(r.link);

          if (!v1) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: formatResults(results, "DuckDuckGo"),
                },
              ],
              details: undefined,
            };
          }
          return buildV1SuccessResult(toolCallId, query, "duckduckgo", results);
        } catch (e) {
          lastError = e;
        }
      }

      if (!v1) {
        const msg =
          lastError instanceof Error ? lastError.message : String(lastError);
        return {
          content: [
            { type: "text" as const, text: `Web search error: ${msg}` },
          ],
          details: undefined,
        };
      }

      // v1 diagnostics must never project raw provider body text (which may
      // echo request/auth details); only the sanitized classifier message
      // is safe to surface here.
      const failureRecord = buildWebSearchFailureRecord({
        id: toolCallId,
        query,
        provider: lastProviderLabel,
        error: classifyWebSearchError(lastError),
      });
      const details: WebSearchToolDetails = { web_search: failureRecord };
      return {
        content: [
          {
            type: "text" as const,
            text: `Web search error: ${failureRecord.error?.message}`,
          },
        ],
        details,
      };
    },
  };
}

function buildV1SuccessResult(
  toolCallId: string,
  query: string,
  providerId: string,
  results: SearchResult[],
): {
  content: Array<{ type: "text"; text: string }>;
  details: WebSearchToolDetails;
} {
  const record = buildWebSearchCallRecord({
    id: toolCallId,
    query,
    provider: providerId,
    results,
  });
  const readable = record.results.map((r) => ({
    title: r.title ?? r.url,
    link: r.url,
    snippet: r.snippet ?? "",
    age: r.age,
    content: r.content,
  }));
  const text =
    record.source_details === "unavailable"
      ? "Search completed, but validated source details are unavailable."
      : formatResults(
          readable,
          providerId,
          record.results.map((r) => r.source_id),
        ) + (record.results.length > 0 ? V1_CITATION_INSTRUCTION : "");
  const details: WebSearchToolDetails = { web_search: record };
  return { content: [{ type: "text" as const, text }], details };
}
