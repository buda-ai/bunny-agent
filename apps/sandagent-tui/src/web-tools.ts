/**
 * Web search and content extraction tools for sandagent pi runner.
 *
 * Implements two tools:
 * - `web_search`: Search the web via pluggable providers (Brave, Tavily, DuckDuckGo)
 * - `web_fetch`: Fetch and extract readable content from a URL
 *
 * Tool names are intentionally generic so they work naturally across all
 * LLM providers (Claude, Gemini, GPT, etc.).
 *
 * Provider is auto-detected from available API keys in env, with DuckDuckGo
 * as a zero-config fallback.
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Search result type (shared across providers)
// ---------------------------------------------------------------------------

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  age?: string;
  content?: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface WebSearchProvider {
  /** Provider identifier (e.g. "brave", "tavily", "duckduckgo") */
  id: string;
  /** Human-readable label */
  label: string;
  /** Env var names that hold the API key. Empty = no key required. */
  envKeys: string[];
  /** Execute a search query. */
  search(params: {
    apiKey: string | undefined;
    query: string;
    count: number;
    country?: string;
    freshness?: string;
  }): Promise<SearchResult[]>;
}

// ---------------------------------------------------------------------------
// Provider: Brave Search
// ---------------------------------------------------------------------------

const braveProvider: WebSearchProvider = {
  id: "brave",
  label: "Brave Search",
  envKeys: ["BRAVE_API_KEY"],
  async search({ apiKey, query, count, country, freshness }) {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(count, 20)),
    });
    if (country) params.set("country", country);
    if (freshness) params.set("freshness", freshness);

    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey!,
        },
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Brave API ${res.status}: ${res.statusText}\n${body}`);
    }
    // biome-ignore lint/suspicious/noExplicitAny: Brave API response
    const data: any = await res.json();
    const results: SearchResult[] = [];
    if (data.web?.results) {
      for (const r of data.web.results) {
        if (results.length >= count) break;
        results.push({
          title: r.title ?? "",
          link: r.url ?? "",
          snippet: r.description ?? "",
          age: r.age ?? r.page_age ?? "",
        });
      }
    }
    return results;
  },
};

// ---------------------------------------------------------------------------
// Provider: Tavily
// ---------------------------------------------------------------------------

const tavilyProvider: WebSearchProvider = {
  id: "tavily",
  label: "Tavily",
  envKeys: ["TAVILY_API_KEY"],
  async search({ apiKey, query, count }) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(count, 10),
        include_answer: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Tavily API ${res.status}: ${res.statusText}\n${body}`);
    }
    // biome-ignore lint/suspicious/noExplicitAny: Tavily API response
    const data: any = await res.json();
    const results: SearchResult[] = [];
    if (Array.isArray(data.results)) {
      for (const r of data.results) {
        results.push({
          title: r.title ?? "",
          link: r.url ?? "",
          snippet: r.content ?? "",
        });
      }
    }
    return results;
  },
};

// ---------------------------------------------------------------------------
// Provider registry & resolution
// ---------------------------------------------------------------------------

/** Map of provider id → provider instance for O(1) lookup. */

/** Ordered by preference for auto-detection. */
const AUTO_DETECT_ORDER: WebSearchProvider[] = [braveProvider, tavilyProvider];

function getEnv(env: Record<string, string>, key: string): string | undefined {
  const v = env[key] ?? process.env[key];
  return v && v.length > 0 ? v : undefined;
}

interface ResolvedProvider {
  provider: WebSearchProvider;
  apiKey: string;
}

/**
 * Resolve all available search providers from env keys, ordered by preference.
 * First entry is the primary; rest are fallbacks for rate-limit/error recovery.
 */
export function resolveSearchProviders(
  env: Record<string, string>,
): ResolvedProvider[] {
  const available: ResolvedProvider[] = [];

  for (const p of AUTO_DETECT_ORDER) {
    for (const key of p.envKeys) {
      const val = getEnv(env, key);
      if (val) {
        available.push({ provider: p, apiKey: val });
        break;
      }
    }
  }

  return available;
}

/** Convenience: resolve the primary provider (null if none available). */
export function resolveSearchProvider(
  env: Record<string, string>,
): ResolvedProvider | null {
  const all = resolveSearchProviders(env);
  return all.length > 0 ? all[0] : null;
}

/** Check if an error is a rate-limit / quota error worth retrying with fallback. */
function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes("429") ||
    msg.includes("rate") ||
    msg.includes("quota") ||
    msg.includes("limit")
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<(p|div|h[1-6]|li|tr)[^>]*>/gi, "\n")
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

async function fetchPageContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    if (!res.ok) return `(HTTP ${res.status}: ${res.statusText})`;
    const html = await res.text();
    const text = htmlToText(html);
    return text.length > 50_000
      ? `${text.slice(0, 50_000)}\n\n[Truncated]`
      : text;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return `(Error fetching ${url}: ${msg})`;
  } finally {
    clearTimeout(timeout);
  }
}

function formatSearchResults(
  results: SearchResult[],
  providerLabel: string,
): string {
  if (results.length === 0) return "No results found.";
  const header = `[${providerLabel}] ${results.length} result(s)\n`;
  return (
    header +
    results
      .map((r, i) => {
        const lines = [
          `--- Result ${i + 1} ---`,
          `Title: ${r.title}`,
          `Link: ${r.link}`,
        ];
        if (r.age) lines.push(`Age: ${r.age}`);
        lines.push(`Snippet: ${r.snippet}`);
        if (r.content) lines.push(`Content:\n${r.content}`);
        return lines.join("\n");
      })
      .join("\n\n")
  );
}

// ---------------------------------------------------------------------------
// JSON-Schema parameter definitions
// ---------------------------------------------------------------------------

const webSearchSchema = {
  type: "object" as const,
  required: ["query"],
  properties: {
    query: {
      type: "string" as const,
      description: "Search query string",
    },
    count: {
      type: "number" as const,
      description: "Number of results to return (default: 5, max: 20)",
    },
    freshness: {
      type: "string" as const,
      description:
        'Filter by time: "pd" (past day), "pw" (past week), "pm" (past month), "py" (past year), or "YYYY-MM-DDtoYYYY-MM-DD"',
    },
    country: {
      type: "string" as const,
      description: "Two-letter country code for results (default: US)",
    },
    fetch_content: {
      type: "boolean" as const,
      description:
        "If true, also fetch and include page content for each result (slower)",
    },
  },
};

const webFetchSchema = {
  type: "object" as const,
  required: ["url"],
  properties: {
    url: {
      type: "string" as const,
      description: "URL to fetch and extract readable content from",
    },
  },
};

// ---------------------------------------------------------------------------
// Tool builders
// ---------------------------------------------------------------------------

/**
 * Build a `web_search` ToolDefinition with auto-detected provider and
 * automatic fallback on rate-limit errors.
 *
 * Priority: Brave (BRAVE_API_KEY) > Tavily (TAVILY_API_KEY).
 * If the primary provider returns 429/rate-limit, retries with the next available provider.
 */
export function buildWebSearchTool(
  env: Record<string, string>,
): ToolDefinition {
  const providers = resolveSearchProviders(env);
  if (providers.length === 0) {
    throw new Error(
      "web_search: no search provider available. Set BRAVE_API_KEY or TAVILY_API_KEY.",
    );
  }

  return {
    name: "web_search",
    label: "web search",
    description:
      "Search the web for information. Returns titles, URLs, and snippets. " +
      "Use for documentation lookups, fact-checking, current events, or any query requiring web results.",
    promptSnippet:
      "web_search(query, count?, freshness?, country?, fetch_content?) - search the web",
    promptGuidelines: [
      "Use web_search when you need current information, documentation, or facts not available locally.",
      "Set fetch_content=true only when you need the actual page text, not just snippets — it is slower.",
      "Prefer specific, focused queries over broad ones for better results.",
    ],
    // biome-ignore lint/suspicious/noExplicitAny: plain JSON Schema compatible with TypeBox TSchema
    parameters: webSearchSchema as any,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const query = p.query as string;
      const count = (p.count as number) ?? 5;
      const country = (p.country as string) ?? "US";
      const freshness = p.freshness as string | undefined;
      const shouldFetchContent = (p.fetch_content as boolean) ?? false;

      // Try each provider in order; fallback on rate-limit errors
      let lastError: unknown;
      for (const { provider, apiKey } of providers) {
        try {
          const results = await provider.search({
            apiKey,
            query,
            count,
            country,
            freshness,
          });

          if (shouldFetchContent) {
            for (const r of results) {
              r.content = await fetchPageContent(r.link);
            }
          }

          return {
            content: [
              {
                type: "text" as const,
                text: formatSearchResults(results, provider.label),
              },
            ],
            details: undefined,
          };
        } catch (e: unknown) {
          lastError = e;
          if (isRateLimitError(e) && providers.length > 1) {
            console.error(
              `[sandagent:pi] ${provider.label} rate-limited, trying next provider...`,
            );
            continue;
          }
          // Non-rate-limit error: don't fallback
          break;
        }
      }

      const msg =
        lastError instanceof Error ? lastError.message : String(lastError);
      return {
        content: [
          {
            type: "text" as const,
            text: `Web search error: ${msg}`,
          },
        ],
        details: undefined,
      };
    },
  };
}

/**
 * Build a `web_fetch` ToolDefinition that fetches a URL and extracts
 * readable text content. Lightweight (no jsdom/readability deps).
 */
export function buildWebFetchTool(): ToolDefinition {
  return {
    name: "web_fetch",
    label: "web fetch",
    description:
      "Fetch a web page and extract its readable text content. " +
      "Use when you need the full content of a specific URL (article, docs page, etc.).",
    promptSnippet: "web_fetch(url) - fetch and extract content from a URL",
    promptGuidelines: [
      "Use web_fetch when you already have a URL and need its content.",
      "For finding URLs first, use web_search instead.",
    ],
    // biome-ignore lint/suspicious/noExplicitAny: plain JSON Schema compatible with TypeBox TSchema
    parameters: webFetchSchema as any,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const url = p.url as string;
      try {
        const content = await fetchPageContent(url);
        return {
          content: [{ type: "text" as const, text: content }],
          details: undefined,
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [
            { type: "text" as const, text: `Error fetching URL: ${msg}` },
          ],
          details: undefined,
        };
      }
    },
  };
}
