/**
 * Web search tool — pluggable providers (Brave, Tavily).
 * Provider auto-detected from env keys; Brave preferred over Tavily.
 */
import type { SearchResult, ToolDefinition } from "../types.js";

export type { SearchResult };

export interface WebSearchProvider {
  id: string;
  label: string;
  envKeys: string[];
  search(params: {
    apiKey: string | undefined;
    query: string;
    count: number;
    country?: string;
    freshness?: string;
  }): Promise<SearchResult[]>;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const braveProvider: WebSearchProvider = {
  id: "brave",
  label: "Brave Search",
  envKeys: ["BRAVE_API_KEY"],
  async search({ apiKey, query, count, country, freshness }) {
    const params = new URLSearchParams({ q: query, count: String(Math.min(count, 20)) });
    if (country) params.set("country", country);
    if (freshness) params.set("freshness", freshness);
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": apiKey! },
    });
    if (!res.ok) throw new Error(`Brave API ${res.status}: ${await res.text().catch(() => "")}`);
    // biome-ignore lint/suspicious/noExplicitAny: Brave API response
    const data: any = await res.json();
    const results: SearchResult[] = [];
    for (const r of data.web?.results ?? []) {
      if (results.length >= count) break;
      results.push({ title: r.title ?? "", link: r.url ?? "", snippet: r.description ?? "", age: r.age ?? r.page_age ?? "" });
    }
    return results;
  },
};

const tavilyProvider: WebSearchProvider = {
  id: "tavily",
  label: "Tavily",
  envKeys: ["TAVILY_API_KEY"],
  async search({ apiKey, query, count }) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: Math.min(count, 10), include_answer: false }),
    });
    if (!res.ok) throw new Error(`Tavily API ${res.status}: ${await res.text().catch(() => "")}`);
    // biome-ignore lint/suspicious/noExplicitAny: Tavily API response
    const data: any = await res.json();
    return (data.results ?? []).map((r: any) => ({ title: r.title ?? "", link: r.url ?? "", snippet: r.content ?? "" }));
  },
};

const AUTO_DETECT_ORDER = [braveProvider, tavilyProvider];

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

interface ResolvedProvider {
  provider: WebSearchProvider;
  apiKey: string;
}

function getEnv(env: Record<string, string>, key: string): string | undefined {
  const v = env[key] ?? process.env[key];
  return v && v.length > 0 ? v : undefined;
}

export function resolveSearchProviders(env: Record<string, string>): ResolvedProvider[] {
  const available: ResolvedProvider[] = [];
  for (const p of AUTO_DETECT_ORDER) {
    for (const key of p.envKeys) {
      const val = getEnv(env, key);
      if (val) { available.push({ provider: p, apiKey: val }); break; }
    }
  }
  return available;
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.includes("429") || err.message.includes("rate") || err.message.includes("quota");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function fetchPageContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      signal: controller.signal,
    });
    if (!res.ok) return `(HTTP ${res.status}: ${res.statusText})`;
    const text = htmlToText(await res.text());
    return text.length > 50_000 ? `${text.slice(0, 50_000)}\n\n[Truncated]` : text;
  } catch (e: unknown) {
    return `(Error fetching ${url}: ${e instanceof Error ? e.message : String(e)})`;
  } finally {
    clearTimeout(timeout);
  }
}

function formatResults(results: SearchResult[], label: string): string {
  if (results.length === 0) return "No results found.";
  return `[${label}] ${results.length} result(s)\n` + results.map((r, i) => {
    const lines = [`--- Result ${i + 1} ---`, `Title: ${r.title}`, `Link: ${r.link}`];
    if (r.age) lines.push(`Age: ${r.age}`);
    lines.push(`Snippet: ${r.snippet}`);
    if (r.content) lines.push(`Content:\n${r.content}`);
    return lines.join("\n");
  }).join("\n\n");
}

// ---------------------------------------------------------------------------
// Tool builder
// ---------------------------------------------------------------------------

export function buildWebSearchTool(env: Record<string, string>): ToolDefinition {
  const providers = resolveSearchProviders(env);
  if (providers.length === 0) throw new Error("web_search: no provider. Set BRAVE_API_KEY or TAVILY_API_KEY.");

  return {
    name: "web_search",
    label: "web search",
    description: "Search the web. Returns titles, URLs, and snippets.",
    promptSnippet: "web_search(query, count?, freshness?, country?, fetch_content?)",
    promptGuidelines: [
      "Use for current info, docs, or facts not available locally.",
      "Set fetch_content=true only when you need full page text — it is slower.",
    ],
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        count: { type: "number", description: "Default 5, max 20" },
        freshness: { type: "string", description: '"pd","pw","pm","py" or date range' },
        country: { type: "string", description: "Two-letter country code" },
        fetch_content: { type: "boolean" },
      },
    },
    async execute(_id, params, _signal, _onUpdate) {
      const p = params as Record<string, unknown>;
      const query = p.query as string;
      const count = (p.count as number) ?? 5;
      const country = (p.country as string) ?? "US";
      const freshness = p.freshness as string | undefined;
      const shouldFetch = (p.fetch_content as boolean) ?? false;

      let lastError: unknown;
      for (const { provider, apiKey } of providers) {
        try {
          const results = await provider.search({ apiKey, query, count, country, freshness });
          if (shouldFetch) for (const r of results) r.content = await fetchPageContent(r.link);
          return { content: [{ type: "text" as const, text: formatResults(results, provider.label) }], details: undefined };
        } catch (e) {
          lastError = e;
          if (isRateLimitError(e) && providers.length > 1) continue;
          break;
        }
      }
      return { content: [{ type: "text" as const, text: `Web search error: ${lastError instanceof Error ? lastError.message : String(lastError)}` }], details: undefined };
    },
  };
}
