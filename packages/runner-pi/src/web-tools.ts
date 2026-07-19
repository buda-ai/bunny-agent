/**
 * Web search and content extraction tools for bunny-agent pi runner.
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

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ToolUsageDetails } from "./tool-details.js";

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

interface SearchExecutionResult {
  results: SearchResult[];
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
    signal?: AbortSignal;
  }): Promise<SearchExecutionResult>;
}

/** Per-provider search usage row under `WebSearchUsageDetails.raw`. */
export type WebSearchProviderUsage = {
  requests: number;
  fetchedPages: number;
};

/** Usage payload for `web_search` tool results (`details.usage`). */
export interface WebSearchUsageDetails
  extends ToolUsageDetails<WebSearchProviderUsage> {}

/**
 * Normalised web search billing for metadata (synthesised from `details.usage.raw`;
 * not present on the tool result payload).
 */
export interface WebSearchBillingDetails {
  type: "web_search";
  providerId: string;
  requests: number;
  fetchedPages: number;
}

// ---------------------------------------------------------------------------
// Provider: Brave Search
// ---------------------------------------------------------------------------

const braveProvider: WebSearchProvider = {
  id: "brave",
  label: "Brave Search",
  envKeys: ["BRAVE_API_KEY"],
  async search({ apiKey, query, count, country, freshness, signal }) {
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
        signal,
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
    return { results };
  },
};

// ---------------------------------------------------------------------------
// Provider: Tavily
// ---------------------------------------------------------------------------

const tavilyProvider: WebSearchProvider = {
  id: "tavily",
  label: "Tavily",
  envKeys: ["TAVILY_API_KEY"],
  async search({ apiKey, query, count, signal }) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: Math.min(count, 10),
        include_answer: false,
      }),
      signal,
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
    return { results };
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

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function hasRetryableNetworkCode(
  error: unknown,
  seen = new Set<object>(),
): boolean {
  if (error === null || typeof error !== "object" || seen.has(error))
    return false;
  seen.add(error);

  const code = getErrorField(error, "code");
  if (code && RETRYABLE_NETWORK_ERROR_CODES.has(code)) return true;

  const nestedErrors: unknown[] = [];
  if ("cause" in error) nestedErrors.push(error.cause);
  if ("errors" in error && Array.isArray(error.errors)) {
    nestedErrors.push(...error.errors);
  }
  return nestedErrors.some((nested) => hasRetryableNetworkCode(nested, seen));
}

function isRetryableNetworkError(err: unknown): boolean {
  if (hasRetryableNetworkCode(err)) return true;
  return err instanceof TypeError && err.message === "fetch failed";
}

function getFallbackReason(
  err: unknown,
): "rate limit" | "network error" | null {
  if (isRateLimitError(err)) return "rate limit";
  if (isRetryableNetworkError(err)) return "network error";
  return null;
}

function getErrorField(error: object, key: string): string | undefined {
  if (!(key in error)) return undefined;
  const value = (error as Record<string, unknown>)[key];
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function formatErrorCause(cause: unknown): string {
  if (cause === null || cause === undefined) return "unknown";
  if (typeof cause !== "object") return String(cause);

  const details = [
    ["code", getErrorField(cause, "code")],
    [
      "message",
      cause instanceof Error ? cause.message : getErrorField(cause, "message"),
    ],
    ["errno", getErrorField(cause, "errno")],
    ["syscall", getErrorField(cause, "syscall")],
    ["hostname", getErrorField(cause, "hostname")],
    ["address", getErrorField(cause, "address")],
    ["port", getErrorField(cause, "port")],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${value}`);

  const nestedErrors =
    "errors" in cause && Array.isArray(cause.errors) ? cause.errors : [];
  if (nestedErrors.length > 0) {
    const nested = nestedErrors.slice(0, 3).map(formatErrorCause).join("; ");
    details.push(`errors=[${nested}]`);
  }

  return details.length > 0 ? details.join(", ") : String(cause);
}

function formatWebToolError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause =
    "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
  return cause === undefined
    ? error.message
    : `${error.name}: ${error.message} (cause: ${formatErrorCause(cause)})`;
}

function getSafeTarget(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "invalid-url";
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function stripNullBytes(s: string): string {
  return s.replace(/\0/g, "");
}

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

async function fetchPageContent(
  url: string,
  externalSignal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  // If external signal fires, also abort our controller
  externalSignal?.addEventListener("abort", () => controller.abort(), {
    once: true,
  });
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
    const text = stripNullBytes(htmlToText(html));
    return text.length > 50_000
      ? `${text.slice(0, 50_000)}\n\n[Truncated]`
      : text;
  } catch (e: unknown) {
    const msg = formatWebToolError(e);
    console.error(
      `[bunny-agent:pi] web_fetch failed target=${getSafeTarget(url)}: ${msg}`,
    );
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
          `Title: ${stripNullBytes(r.title)}`,
          `Link: ${r.link}`,
        ];
        if (r.age) lines.push(`Age: ${r.age}`);
        lines.push(`Snippet: ${stripNullBytes(r.snippet)}`);
        if (r.content) lines.push(`Content:\n${stripNullBytes(r.content)}`);
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
    async execute(_toolCallId, params, signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const query = p.query as string;
      const count = (p.count as number) ?? 5;
      const country = (p.country as string) ?? "US";
      const freshness = p.freshness as string | undefined;
      const shouldFetchContent = (p.fetch_content as boolean) ?? false;

      // Try each provider in order; fallback on rate-limit and network errors.
      let lastError: unknown;
      let lastProviderLabel = "unknown provider";
      for (const [providerIndex, { provider, apiKey }] of providers.entries()) {
        lastProviderLabel = provider.label;
        try {
          const { results } = await provider.search({
            apiKey,
            query,
            count,
            country,
            freshness,
            signal,
          });

          let fetchedPages = 0;
          if (shouldFetchContent) {
            for (const r of results) {
              r.content = await fetchPageContent(r.link, signal);
              fetchedPages += 1;
            }
          }

          const usage: WebSearchUsageDetails = {
            raw: {
              [provider.id]: {
                requests: 1,
                fetchedPages,
              },
            },
          };

          return {
            content: [
              {
                type: "text" as const,
                text: formatSearchResults(results, provider.label),
              },
            ],
            details: {
              usage,
            },
          };
        } catch (e: unknown) {
          lastError = e;
          const diagnostic = formatWebToolError(e);
          console.error(
            `[bunny-agent:pi] ${provider.label} web_search failed: ${diagnostic}`,
          );
          const fallbackReason = getFallbackReason(e);
          const nextProvider = providers[providerIndex + 1];
          if (fallbackReason && nextProvider) {
            console.error(
              `[bunny-agent:pi] ${provider.label} ${fallbackReason}, trying ${nextProvider.provider.label}...`,
            );
            continue;
          }
          // Authentication and request errors should be surfaced as-is.
          break;
        }
      }

      const msg = formatWebToolError(lastError);
      return {
        content: [
          {
            type: "text" as const,
            text: `Web search error (${lastProviderLabel}): ${msg}`,
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
    async execute(_toolCallId, params, signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const url = p.url as string;
      try {
        const content = await fetchPageContent(url, signal);
        return {
          content: [{ type: "text" as const, text: content }],
          details: undefined,
        };
      } catch (e: unknown) {
        const msg = formatWebToolError(e);
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
