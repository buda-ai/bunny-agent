/** Server-only document identity and read receipt hashing. */
import { createHash } from "node:crypto";
import {
  type DocumentCitationSource,
  type DocumentIdentity,
  type DocumentLineLocator,
  type DocumentReadResult,
  isDocumentReadResult,
} from "./document.js";

export function hashDocumentText(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}
export function deriveDocumentKey(document: DocumentIdentity): string {
  const identity = [
    document.provider,
    document.namespace,
    document.collection,
    document.document_id,
    document.version,
    document.content_hash,
  ];
  return `doc_${hashDocumentText(JSON.stringify(identity)).slice(7)}`;
}
export function deriveDocumentSourceId(
  document: DocumentIdentity,
  locator: DocumentLineLocator,
  excerptHash: string,
): string {
  return `src_${hashDocumentText(JSON.stringify([deriveDocumentKey(document), locator.type, locator.start_line, locator.end_line, excerptHash])).slice(7)}`;
}
export function validateDocumentReadResult(
  value: unknown,
): value is DocumentReadResult {
  return (
    isDocumentReadResult(value) &&
    value.excerpts.every(
      (excerpt) => hashDocumentText(excerpt.text) === excerpt.excerpt_hash,
    )
  );
}
export function documentSourcesFromRead(
  read: DocumentReadResult,
  mcpServer: string,
): DocumentCitationSource[] {
  return read.excerpts.map((excerpt) => ({
    mcp_server: mcpServer,
    source_id: deriveDocumentSourceId(
      read.document,
      excerpt.locator,
      excerpt.excerpt_hash,
    ),
    document_key: deriveDocumentKey(read.document),
    document: { ...read.document },
    locator: { ...excerpt.locator },
    excerpt_hash: excerpt.excerpt_hash,
  }));
}
export function hasValidDocumentSourceIdentity(
  source: DocumentCitationSource,
): boolean {
  return (
    deriveDocumentKey(source.document) === source.document_key &&
    deriveDocumentSourceId(
      source.document,
      source.locator,
      source.excerpt_hash,
    ) === source.source_id
  );
}
