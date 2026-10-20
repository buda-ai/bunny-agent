/** Browser-safe document read receipts and answer citation metadata. */

import { codePointLength } from "./projection.js";
import type {
  CitationBinding,
  CitationDiagnostic,
  CitationProcessingState,
} from "./types.js";

export interface DocumentIdentity {
  provider: string;
  namespace: string;
  collection: string;
  document_id: string;
  path: string;
  title: string;
  media_type: string;
  version: string;
  /** SHA-256 of the original canonical document bytes (e.g. PDF bytes). */
  content_hash: string;
}
export interface DocumentLineLocator {
  type: "lines";
  /** One-based, inclusive lines of the versioned extracted text. */
  start_line: number;
  end_line: number;
}
export interface DocumentExcerpt {
  locator: DocumentLineLocator;
  /** Exact LF-normalized lines, without an added trailing separator. */
  text: string;
  excerpt_hash: string;
}
export interface DocumentReadResult {
  schema_version: 1;
  type: "document_read_result";
  document: DocumentIdentity;
  excerpts: DocumentExcerpt[];
}
export interface DocumentCitationSource {
  source_id: string;
  /** Trusted configured server identity, injected by the executing MCP bridge. */
  mcp_server: string;
  document_key: string;
  document: DocumentIdentity;
  locator: DocumentLineLocator;
  excerpt_hash: string;
}
/** Bunny extension; this is not an OpenAI file_citation annotation. */
export interface DocumentCitationAnnotation {
  type: "document_citation";
  start_index: number;
  end_index: number;
  source_id: string;
  title: string;
}
export interface DocumentCitationContractMetadata {
  schema_version: 1;
  offset_unit: "unicode-code-points";
  annotations: DocumentCitationAnnotation[];
  bindings: CitationBinding[];
  sources: DocumentCitationSource[];
  processing: CitationProcessingState;
  diagnostics?: CitationDiagnostic[];
}
export const DOCUMENT_CITATION_LIMITS = Object.freeze({
  maxExcerptsPerRead: 50,
  maxExcerptChars: 32_768,
  maxSourcesPerTurn: 500,
  maxAnnotationsPerTextPart: 1_000,
});
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function string(value: unknown, max = 2048): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    ![...value].some(
      (char) => char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127,
    )
  );
}
export function isDocumentIdentity(value: unknown): value is DocumentIdentity {
  if (
    !object(value) ||
    !keys(value, [
      "provider",
      "namespace",
      "collection",
      "document_id",
      "path",
      "title",
      "media_type",
      "version",
      "content_hash",
    ])
  )
    return false;
  return (
    [
      "provider",
      "namespace",
      "collection",
      "document_id",
      "path",
      "title",
      "media_type",
      "version",
    ].every((key) => string(value[key])) &&
    typeof value.content_hash === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(value.content_hash) &&
    !/^[a-z][a-z0-9+.-]*:\/\//i.test(value.path as string) &&
    /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(
      value.media_type as string,
    )
  );
}
export function isDocumentLineLocator(
  value: unknown,
): value is DocumentLineLocator {
  return (
    object(value) &&
    keys(value, ["type", "start_line", "end_line"]) &&
    value.type === "lines" &&
    Number.isSafeInteger(value.start_line) &&
    (value.start_line as number) >= 1 &&
    Number.isSafeInteger(value.end_line) &&
    (value.end_line as number) >= (value.start_line as number)
  );
}
export function isDocumentReadResult(
  value: unknown,
): value is DocumentReadResult {
  return (
    object(value) &&
    keys(value, ["schema_version", "type", "document", "excerpts"]) &&
    value.schema_version === 1 &&
    value.type === "document_read_result" &&
    isDocumentIdentity(value.document) &&
    Array.isArray(value.excerpts) &&
    value.excerpts.length > 0 &&
    value.excerpts.length <= DOCUMENT_CITATION_LIMITS.maxExcerptsPerRead &&
    value.excerpts.every(
      (excerpt) =>
        object(excerpt) &&
        keys(excerpt, ["locator", "text", "excerpt_hash"]) &&
        isDocumentLineLocator(excerpt.locator) &&
        typeof excerpt.text === "string" &&
        excerpt.text.length > 0 &&
        excerpt.text.length <= DOCUMENT_CITATION_LIMITS.maxExcerptChars &&
        !excerpt.text.includes("\r") &&
        !excerpt.text.includes("\0") &&
        excerpt.text.split("\n").length ===
          excerpt.locator.end_line - excerpt.locator.start_line + 1 &&
        typeof excerpt.excerpt_hash === "string" &&
        /^sha256:[a-f0-9]{64}$/.test(excerpt.excerpt_hash),
    )
  );
}
export function isDocumentCitationSource(
  value: unknown,
): value is DocumentCitationSource {
  return (
    object(value) &&
    keys(value, [
      "source_id",
      "mcp_server",
      "document_key",
      "document",
      "locator",
      "excerpt_hash",
      "tool_call_ids",
    ]) &&
    string(value.mcp_server, 128) &&
    typeof value.source_id === "string" &&
    /^src_[a-f0-9]{64}$/.test(value.source_id) &&
    typeof value.document_key === "string" &&
    /^doc_[a-f0-9]{64}$/.test(value.document_key) &&
    isDocumentIdentity(value.document) &&
    isDocumentLineLocator(value.locator) &&
    typeof value.excerpt_hash === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(value.excerpt_hash)
  );
}
export function isValidDocumentCitationContractMetadata(
  value: unknown,
  context: { text?: string } = {},
): value is DocumentCitationContractMetadata {
  if (
    !object(value) ||
    value.schema_version !== 1 ||
    value.offset_unit !== "unicode-code-points" ||
    !["complete", "partial"].includes(value.processing as string) ||
    !Array.isArray(value.sources) ||
    value.sources.length > 500 ||
    !value.sources.every(isDocumentCitationSource) ||
    !Array.isArray(value.annotations) ||
    value.annotations.length > 1000 ||
    !Array.isArray(value.bindings) ||
    value.bindings.length !== value.annotations.length
  )
    return false;
  const sources = new Map<string, string>();
  for (const source of value.sources as DocumentCitationSource[]) {
    if (sources.has(source.source_id)) return false;
    sources.set(source.source_id, source.document.title);
  }
  const citedSources = new Set<string>();
  let previousEnd = 0;
  const textLength =
    context.text === undefined ? 256_000 : codePointLength(context.text);
  for (let index = 0; index < value.annotations.length; index++) {
    const a = value.annotations[index];
    if (
      !object(a) ||
      !keys(a, ["type", "start_index", "end_index", "source_id", "title"]) ||
      a.type !== "document_citation" ||
      !Number.isSafeInteger(a.start_index) ||
      (a.start_index as number) < 0 ||
      (a.start_index as number) < previousEnd ||
      !Number.isSafeInteger(a.end_index) ||
      (a.end_index as number) <= (a.start_index as number) ||
      (a.end_index as number) > textLength ||
      !string(a.source_id) ||
      !sources.has(a.source_id) ||
      a.title !== sources.get(a.source_id)
    )
      return false;
    const b = value.bindings[index];
    if (
      !object(b) ||
      !keys(b, ["annotation_index", "source_id", "origin", "tool_call_ids"]) ||
      b.annotation_index !== index ||
      b.source_id !== a.source_id ||
      b.origin !== "explicit_source_marker" ||
      !Array.isArray(b.tool_call_ids) ||
      b.tool_call_ids.length === 0 ||
      b.tool_call_ids.length > 50 ||
      !b.tool_call_ids.every((id) => string(id, 1024)) ||
      new Set(b.tool_call_ids).size !== b.tool_call_ids.length
    )
      return false;
    previousEnd = a.end_index as number;
    citedSources.add(a.source_id);
  }
  if (citedSources.size !== sources.size) return false;
  return (
    value.diagnostics === undefined ||
    (Array.isArray(value.diagnostics) &&
      value.diagnostics.length <= 16 &&
      value.diagnostics.every(
        (d) => object(d) && string(d.code) && string(d.message),
      ))
  );
}
