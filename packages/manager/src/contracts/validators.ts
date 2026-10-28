/** Browser-safe validation of the v1 search and answer citation contracts. */
import { codePointLength, isValidCodePointRange } from "./projection.js";
import {
  type CitationBinding,
  type CitationContractMetadata,
  type CitationDiagnostic,
  SEARCH_CONTRACT_LIMITS,
  SEARCH_CONTRACT_VERSION_1,
  type SearchContractVersion,
  type UrlCitationAnnotation,
  type WebSearchAction,
  type WebSearchCallRecord,
  type WebSearchError,
  type WebSearchErrorCode,
  type WebSearchResultItem,
  type WebSearchSource,
} from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Absolute HTTP(S) URLs without embedded user credentials. */
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
    );
  } catch {
    return false;
  }
}

export function isSupportedSearchContractVersion(
  value: unknown,
): value is SearchContractVersion {
  return value === SEARCH_CONTRACT_VERSION_1;
}

export function isWebSearchSource(value: unknown): value is WebSearchSource {
  if (!isPlainObject(value)) return false;
  return (
    value.type === "url" &&
    isNonEmptyString(value.source_id) &&
    isSafeHttpUrl(value.url) &&
    (value.title === undefined || typeof value.title === "string")
  );
}

export function isWebSearchResultItem(
  value: unknown,
): value is WebSearchResultItem {
  if (!isPlainObject(value)) return false;
  return (
    isNonEmptyString(value.source_id) &&
    isSafeHttpUrl(value.url) &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.snippet === undefined || typeof value.snippet === "string") &&
    (value.age === undefined || typeof value.age === "string") &&
    (value.content === undefined || typeof value.content === "string")
  );
}

/** Comparison matches the server's stable URL hashing without stripping query/fragment. */
function urlIdentity(url: string): string {
  return new URL(url).toString();
}

export function isWebSearchAction(value: unknown): value is WebSearchAction {
  if (!isPlainObject(value)) return false;
  if (value.type !== "search" || typeof value.query !== "string") return false;
  if (
    !Array.isArray(value.sources) ||
    value.sources.length > SEARCH_CONTRACT_LIMITS.maxSourcesPerSearch ||
    !value.sources.every(isWebSearchSource)
  )
    return false;
  const ids = new Set<string>();
  const urls = new Set<string>();
  for (const source of value.sources as WebSearchSource[]) {
    const url = urlIdentity(source.url);
    if (ids.has(source.source_id) || urls.has(url)) return false;
    ids.add(source.source_id);
    urls.add(url);
  }
  return true;
}

const WEB_SEARCH_ERROR_CODES: ReadonlySet<WebSearchErrorCode> = new Set([
  "authentication",
  "rate_limit",
  "network",
  "invalid_request",
  "provider_error",
]);

export function isWebSearchError(value: unknown): value is WebSearchError {
  return (
    isPlainObject(value) &&
    typeof value.code === "string" &&
    WEB_SEARCH_ERROR_CODES.has(value.code as WebSearchErrorCode) &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean"
  );
}

/** Recognized records are trusted only after state and source associations agree. */
export function isValidWebSearchCallRecord(
  value: unknown,
): value is WebSearchCallRecord {
  if (!isPlainObject(value)) return false;
  if (value.schema_version !== 1 || value.type !== "web_search_call")
    return false;
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.provider))
    return false;
  if (value.status !== "completed" && value.status !== "failed") return false;
  if (!isWebSearchAction(value.action)) return false;
  if (
    value.source_details !== "available" &&
    value.source_details !== "unavailable"
  )
    return false;
  if (
    !Array.isArray(value.results) ||
    value.results.length > SEARCH_CONTRACT_LIMITS.maxSourcesPerSearch ||
    !value.results.every(isWebSearchResultItem)
  )
    return false;
  if (typeof value.truncated !== "boolean") return false;
  if (value.status === "failed") {
    if (
      !isWebSearchError(value.error) ||
      value.source_details !== "unavailable"
    )
      return false;
    if (value.action.sources.length > 0 || value.results.length > 0)
      return false;
  } else if (value.error !== undefined) return false;
  if (value.source_details === "unavailable") {
    if (value.action.sources.length > 0 || value.results.length > 0)
      return false;
  }
  const sources = new Map(
    value.action.sources.map((s) => [s.source_id, urlIdentity(s.url)]),
  );
  for (const result of value.results as WebSearchResultItem[]) {
    if (sources.get(result.source_id) !== urlIdentity(result.url)) return false;
  }
  return true;
}

export function isUrlCitationAnnotation(
  value: unknown,
): value is UrlCitationAnnotation {
  if (!isPlainObject(value) || value.type !== "url_citation") return false;
  return (
    Number.isInteger(value.start_index) &&
    (value.start_index as number) >= 0 &&
    Number.isInteger(value.end_index) &&
    (value.end_index as number) > (value.start_index as number) &&
    (value.end_index as number) <=
      SEARCH_CONTRACT_LIMITS.maxCodePointsPerTextPart &&
    isSafeHttpUrl(value.url) &&
    typeof value.title === "string"
  );
}

/** Validate every boundary against the exact emitted Markdown text. */
export function isAnnotationRangeValidForText(
  annotation: UrlCitationAnnotation,
  text: string,
): boolean {
  return isValidCodePointRange(
    text,
    annotation.start_index,
    annotation.end_index,
  );
}

export function isCitationBinding(value: unknown): value is CitationBinding {
  if (!isPlainObject(value)) return false;
  if (
    !Number.isInteger(value.annotation_index) ||
    (value.annotation_index as number) < 0
  )
    return false;
  if (!isNonEmptyString(value.source_id)) return false;
  if (value.origin !== "provider" && value.origin !== "explicit_source_marker")
    return false;
  if (
    !Array.isArray(value.tool_call_ids) ||
    !value.tool_call_ids.every(isNonEmptyString)
  )
    return false;
  if (new Set(value.tool_call_ids).size !== value.tool_call_ids.length)
    return false;
  return (
    value.origin !== "explicit_source_marker" || value.tool_call_ids.length > 0
  );
}

const DIAGNOSTIC_CODES: ReadonlySet<CitationDiagnostic["code"]> = new Set([
  "invalid_version",
  "invalid_range",
  "unsafe_target",
  "duplicate_range",
  "unknown_source",
  "malformed_token",
  "budget_exceeded",
  "unavailable_offset_unit",
]);

function isCitationDiagnostic(value: unknown): value is CitationDiagnostic {
  return (
    isPlainObject(value) &&
    typeof value.code === "string" &&
    DIAGNOSTIC_CODES.has(value.code as CitationDiagnostic["code"]) &&
    typeof value.message === "string"
  );
}

/** Optional external context makes text bounds and source-table validation explicit. */
export interface CitationValidationContext {
  text?: string;
  sources?: readonly WebSearchSource[];
}

/**
 * Check intrinsic structure, unique ranges, and complete, consistent bindings.
 * Supply `text` and `sources` to also validate against emitted text and the
 * authoritative source table. Structural validation alone cannot establish
 * truthfulness of externally supplied source claims.
 */
export function isValidCitationContractMetadata(
  value: unknown,
  context: CitationValidationContext = {},
): value is CitationContractMetadata {
  if (!isPlainObject(value)) return false;
  if (value.schema_version !== 1 || value.offset_unit !== "unicode-code-points")
    return false;
  const textLength =
    context.text === undefined ? undefined : codePointLength(context.text);
  if (
    !Array.isArray(value.annotations) ||
    value.annotations.length >
      SEARCH_CONTRACT_LIMITS.maxAnnotationsPerTextPart ||
    !value.annotations.every(isUrlCitationAnnotation)
  )
    return false;
  if (
    !Array.isArray(value.bindings) ||
    value.bindings.length !== value.annotations.length ||
    !value.bindings.every(isCitationBinding)
  )
    return false;
  if (value.processing !== "complete" && value.processing !== "partial")
    return false;
  if (
    value.diagnostics !== undefined &&
    (!Array.isArray(value.diagnostics) ||
      !value.diagnostics.every(isCitationDiagnostic))
  )
    return false;
  if (
    textLength !== undefined &&
    textLength > SEARCH_CONTRACT_LIMITS.maxCodePointsPerTextPart &&
    (value.processing !== "partial" ||
      !(value.diagnostics as CitationDiagnostic[] | undefined)?.some(
        (d) => d.code === "budget_exceeded",
      ))
  )
    return false;

  const knownUrls = new Map<string, string>();
  const knownIds = new Map<string, string>();
  if (context.sources !== undefined) {
    for (const source of context.sources) {
      if (!isWebSearchSource(source)) return false;
      const url = urlIdentity(source.url);
      if (
        (knownUrls.has(source.source_id) &&
          knownUrls.get(source.source_id) !== url) ||
        (knownIds.has(url) && knownIds.get(url) !== source.source_id)
      )
        return false;
      knownUrls.set(source.source_id, url);
      knownIds.set(url, source.source_id);
    }
  }
  const annotations = value.annotations as UrlCitationAnnotation[];
  const seenRanges = new Set<string>();
  for (const annotation of annotations) {
    const key = JSON.stringify([
      annotation.start_index,
      annotation.end_index,
      urlIdentity(annotation.url),
    ]);
    if (seenRanges.has(key)) return false;
    seenRanges.add(key);
    if (textLength !== undefined && annotation.end_index > textLength)
      return false;
  }
  const boundIndices = new Set<number>();
  const sourceUrls = new Map<string, string>();
  const urlSources = new Map<string, string>();
  for (const binding of value.bindings as CitationBinding[]) {
    if (
      boundIndices.has(binding.annotation_index) ||
      binding.annotation_index >= annotations.length
    )
      return false;
    boundIndices.add(binding.annotation_index);
    const url = urlIdentity(annotations[binding.annotation_index].url);
    if (
      (sourceUrls.has(binding.source_id) &&
        sourceUrls.get(binding.source_id) !== url) ||
      (urlSources.has(url) && urlSources.get(url) !== binding.source_id)
    )
      return false;
    if (
      context.sources !== undefined &&
      knownUrls.get(binding.source_id) !== url
    )
      return false;
    sourceUrls.set(binding.source_id, url);
    urlSources.set(url, binding.source_id);
  }
  return sourceUrls.size <= SEARCH_CONTRACT_LIMITS.maxSourcesPerTurn;
}

export function enforceSourceLimit<T>(sources: T[]): {
  kept: T[];
  truncated: boolean;
} {
  const max = SEARCH_CONTRACT_LIMITS.maxSourcesPerSearch;
  if (sources.length <= max) return { kept: sources, truncated: false };
  return { kept: sources.slice(0, max), truncated: true };
}
