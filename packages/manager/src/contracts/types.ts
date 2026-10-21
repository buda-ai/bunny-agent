/**
 * Browser-safe public types for the versioned web search / answer citation
 * contract (OpenSpec change `standardize-search-tool-citation-contract`).
 *
 * This module and its siblings under `contracts/` MUST stay free of Node
 * built-ins (`node:crypto`, `node:fs`, ...) so they can be re-exported through
 * `@bunny-agent/sdk/contracts` for browser consumers. Server-only helpers
 * (URL source ID hashing) live in `source-id.ts`, which is never imported
 * from this subpath's barrel.
 */

/** Current and only supported search contract version. */
export const SEARCH_CONTRACT_VERSION_1 = 1 as const;

/** Union of search contract versions this release understands. */
export type SearchContractVersion = typeof SEARCH_CONTRACT_VERSION_1;

/** Offset unit declared on terminal text citation metadata. */
export type CitationOffsetUnit = "unicode-code-points";

/** Where a validated citation annotation originated. */
export type CitationOrigin = "provider" | "explicit_source_marker";

/** Whether retrieval detail is actually available for a search record. */
export type SourceDetails = "available" | "unavailable";

/** Lifecycle status of a structured search record. */
export type WebSearchCallStatus = "completed" | "failed";

/** Safe, provider-neutral error codes for structured search failures. */
export type WebSearchErrorCode =
  | "authentication"
  | "rate_limit"
  | "network"
  | "invalid_request"
  | "provider_error";

/** Sanitized structured failure, never containing raw auth headers or keys. */
export interface WebSearchError {
  code: WebSearchErrorCode;
  message: string;
  retryable: boolean;
}

/** A single validated source referenced by a search action. */
export interface WebSearchSource {
  type: "url";
  source_id: string;
  url: string;
  title?: string;
}

/** A single detailed retrieval result, bound to its source identity. */
export interface WebSearchResultItem {
  source_id: string;
  url: string;
  title?: string;
  snippet?: string;
  age?: string;
  /** Optional fetched page content; kept separate from `snippet`. */
  content?: string;
}

/** The `action` field of a v1 web search call envelope. */
export interface WebSearchAction {
  type: "search";
  query: string;
  sources: WebSearchSource[];
}

/**
 * Versioned, Responses-aligned structured web search result envelope.
 *
 * `schema_version`, `source_id`, `source_details`, `results`, `provider`,
 * and `truncated` are Bunny extensions: this is not an assertion of exact
 * OpenAI Responses API compatibility.
 */
interface WebSearchCallRecordBase {
  schema_version: 1;
  type: "web_search_call";
  /** The actual local tool-call ID, not a provider request ID. */
  id: string;
  action: WebSearchAction;
  source_details: SourceDetails;
  results: WebSearchResultItem[];
  provider: string;
  truncated: boolean;
}

/** Failure information is required when narrowing a failed search record. */
export type WebSearchCallRecord = WebSearchCallRecordBase &
  (
    | { status: "completed"; error?: never }
    | { status: "failed"; error: WebSearchError }
  );

/** The flat Responses-shaped URL citation annotation. */
export interface UrlCitationAnnotation {
  type: "url_citation";
  start_index: number;
  end_index: number;
  url: string;
  /** Canonical annotations always carry a title; use the URL if absent upstream. */
  title: string;
}

/** Responses-shaped answer text content carrying citation annotations. */
export interface OutputTextContent {
  type: "output_text";
  text: string;
  annotations: UrlCitationAnnotation[];
}

/**
 * Bunny extension binding one annotation (by index into the sibling
 * `annotations` array) to its source identity and provenance.
 */
export interface CitationBinding {
  annotation_index: number;
  source_id: string;
  origin: CitationOrigin;
  /** Tool-call IDs known to have contributed this source, if any. */
  tool_call_ids: string[];
}

/** Whether a text part's citation processing completed or was bounded. */
export type CitationProcessingState = "complete" | "partial";

/**
 * Terminal per-text-part citation metadata, attached to the runner's
 * `text-end` event under `providerMetadata["bunny-agent"].citation_contract`.
 */
export interface CitationContractMetadata {
  schema_version: 1;
  offset_unit: CitationOffsetUnit;
  annotations: UrlCitationAnnotation[];
  bindings: CitationBinding[];
  processing: CitationProcessingState;
  /** Sanitized diagnostics describing invalid annotations or bounded limits. */
  diagnostics?: CitationDiagnostic[];
}

/** Non-secret diagnostic describing a rejected/truncated citation input. */
export interface CitationDiagnostic {
  code:
    | "invalid_version"
    | "invalid_range"
    | "unsafe_target"
    | "duplicate_range"
    | "unknown_source"
    | "malformed_token"
    | "budget_exceeded"
    | "unavailable_offset_unit";
  message: string;
}

/** Declared capability acknowledgement for a negotiated contract version. */
export interface SearchContractCapabilities {
  version: SearchContractVersion;
  structured_retrieval: boolean;
  native_annotations: boolean;
  explicit_source_marker_annotations: boolean;
}

/** Processing limits published alongside the v1 contract. */
export interface SearchContractLimits {
  maxSourcesPerSearch: number;
  maxSourcesPerTurn: number;
  maxAnnotationsPerTextPart: number;
  maxCodePointsPerTextPart: number;
  maxPendingMarkerSuffixChars: number;
}

export const SEARCH_CONTRACT_LIMITS: Readonly<SearchContractLimits> =
  Object.freeze({
    maxSourcesPerSearch: 50,
    maxSourcesPerTurn: 500,
    maxAnnotationsPerTextPart: 1_000,
    maxCodePointsPerTextPart: 256_000,
    maxPendingMarkerSuffixChars: 128,
  });
