/**
 * Server-only helpers for building a v1 {@link WebSearchCallRecord} from raw
 * provider search results.
 *
 * This module uses `node:crypto` (via `source-id.ts`) and MUST NOT be
 * imported from `contracts/index.ts` (the browser-safe barrel re-exported
 * through `@bunny-agent/sdk/contracts`). Import it directly from
 * `@bunny-agent/manager/contracts/record` in Node-only runner/harness code
 * that actually executes a search.
 */

import { deriveSourceId } from "./source-id.js";
import type {
  WebSearchCallRecord,
  WebSearchError,
  WebSearchErrorCode,
  WebSearchResultItem,
  WebSearchSource,
} from "./types.js";
import { SEARCH_CONTRACT_LIMITS } from "./types.js";
import { isSafeHttpUrl } from "./validators.js";

/** A single raw provider result, as already normalized by each tool's own provider adapter. */
export interface RawWebSearchResult {
  title: string;
  link: string;
  snippet: string;
  age?: string;
  content?: string;
}

/**
 * Project raw provider results into a validated v1 {@link WebSearchCallRecord}.
 *
 * Unsafe URLs are omitted and reported through `truncated`. If every returned
 * URL is unusable, detail is unavailable; that is distinct from a confirmed
 * zero-hit response. Result rows and distinct sources are both bounded.
 */
export function buildWebSearchCallRecord(params: {
  id: string;
  query: string;
  provider: string;
  results: RawWebSearchResult[];
}): WebSearchCallRecord {
  const sources: WebSearchSource[] = [];
  const resultItems: WebSearchResultItem[] = [];
  const seenSourceIds = new Set<string>();
  let truncated = false;

  for (let i = 0; i < params.results.length; i++) {
    if (resultItems.length >= SEARCH_CONTRACT_LIMITS.maxSourcesPerSearch) {
      truncated = true;
      break;
    }
    const raw = params.results[i];
    if (!raw || !isSafeHttpUrl(raw.link)) {
      truncated = true;
      continue;
    }
    const sourceId = deriveSourceId(raw.link);
    if (sourceId === undefined) {
      truncated = true;
      continue;
    }
    const title = typeof raw.title === "string" ? raw.title : undefined;
    if (!seenSourceIds.has(sourceId)) {
      seenSourceIds.add(sourceId);
      sources.push({
        type: "url",
        source_id: sourceId,
        url: raw.link,
        ...(title ? { title } : {}),
      });
    }
    resultItems.push({
      source_id: sourceId,
      url: raw.link,
      ...(title ? { title } : {}),
      ...(typeof raw.snippet === "string" && raw.snippet
        ? { snippet: raw.snippet }
        : {}),
      ...(typeof raw.age === "string" && raw.age ? { age: raw.age } : {}),
      ...(typeof raw.content === "string" && raw.content
        ? { content: raw.content }
        : {}),
    });
  }

  return {
    schema_version: 1,
    type: "web_search_call",
    id: params.id,
    status: "completed",
    action: {
      type: "search",
      query: params.query,
      sources,
    },
    source_details:
      params.results.length > 0 && resultItems.length === 0
        ? "unavailable"
        : "available",
    results: resultItems,
    provider: params.provider,
    truncated,
  };
}

/**
 * Build a `completed` v1 record for a provider that only exposes the search
 * query, with no recoverable result list or citation metadata (e.g. Codex's
 * `web_search` completion). `source_details: "unavailable"` is truthful
 * here: the search genuinely completed, but no sources/results can ever be
 * reconstructed from this provider's event shape — this is distinct from,
 * and must not be confused with, a confirmed zero-hit search.
 */
export function buildWebSearchUnavailableDetailRecord(params: {
  id: string;
  query: string;
  provider: string;
}): WebSearchCallRecord {
  return {
    schema_version: 1,
    type: "web_search_call",
    id: params.id,
    status: "completed",
    action: {
      type: "search",
      query: params.query,
      sources: [],
    },
    source_details: "unavailable",
    results: [],
    provider: params.provider,
    truncated: false,
  };
}

/** Build a sanitized `failed` v1 record. Never include raw auth headers, keys, or unsanitized request dumps in `message`. */
export function buildWebSearchFailureRecord(params: {
  id: string;
  query: string;
  provider: string;
  error: WebSearchError;
}): WebSearchCallRecord {
  return {
    schema_version: 1,
    type: "web_search_call",
    id: params.id,
    status: "failed",
    action: {
      type: "search",
      query: params.query,
      sources: [],
    },
    source_details: "unavailable",
    results: [],
    provider: params.provider,
    truncated: false,
    error: params.error,
  };
}

/** Classify a thrown search error into a safe, provider-neutral {@link WebSearchErrorCode}. */
export function classifyWebSearchError(err: unknown): WebSearchError {
  // Provider response bodies can echo credentials or request dumps. Never
  // project err.message (or String(err)) into public tool results/metadata.
  const httpStatus = extractHttpStatus(err);
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      code: "authentication",
      message: "Web search authentication failed.",
      retryable: false,
    };
  }
  if (httpStatus === 429) {
    return {
      code: "rate_limit",
      message: "Web search rate limit exceeded.",
      retryable: true,
    };
  }
  if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
    return {
      code: "invalid_request",
      message: "Web search request was rejected.",
      retryable: false,
    };
  }
  if (isNetworkError(err)) {
    return {
      code: "network",
      message: "Web search network request failed.",
      retryable: true,
    };
  }
  return {
    code: "provider_error",
    message: "Web search provider failed.",
    retryable: httpStatus !== undefined && httpStatus >= 500,
  };
}

function extractHttpStatus(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined;
  const match = err.message.match(/\b(\d{3})\b/);
  if (!match) return undefined;
  const status = Number.parseInt(match[1], 10);
  return status >= 100 && status < 600 ? status : undefined;
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

function isNetworkError(err: unknown, seen = new Set<object>()): boolean {
  if (err instanceof TypeError && err.message === "fetch failed") return true;
  if (err === null || typeof err !== "object" || seen.has(err)) return false;
  seen.add(err);

  const code = (err as Record<string, unknown>).code;
  if (typeof code === "string" && RETRYABLE_NETWORK_ERROR_CODES.has(code)) {
    return true;
  }

  const nested: unknown[] = [];
  if ("cause" in err) nested.push((err as { cause?: unknown }).cause);
  if ("errors" in err && Array.isArray((err as { errors: unknown[] }).errors)) {
    nested.push(...(err as { errors: unknown[] }).errors);
  }
  return nested.some((n) => isNetworkError(n, seen));
}

export type { WebSearchErrorCode };
