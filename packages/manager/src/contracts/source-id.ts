/**
 * Server-only stable URL source identity generation.
 *
 * This module uses `node:crypto` and MUST NOT be imported from
 * `contracts/index.ts` (the browser-safe barrel re-exported through
 * `@bunny-agent/sdk/contracts`). Import it directly from
 * `@bunny-agent/manager/contracts/source-id` in Node-only runner/harness
 * code that actually registers sources.
 */

import { createHash } from "node:crypto";
import { isSafeHttpUrl } from "./validators.js";

const SOURCE_ID_PREFIX = "src_";

/**
 * Validate and normalize a candidate source URL for identity hashing.
 * Returns `undefined` for unsafe URLs (non-http(s), embedded credentials,
 * unparsable). Path, query, and fragment are preserved verbatim — this
 * intentionally does NOT strip tracking parameters, since doing so would
 * create false equivalence between distinct URLs.
 */
export function normalizeSourceUrl(url: string): string | undefined {
  if (!isSafeHttpUrl(url)) return undefined;
  // `new URL(...).toString()` is deterministic for a given safe input
  // (consistent percent-encoding, lowercased host) without rewriting the
  // semantic content of path/query/fragment.
  return new URL(url).toString();
}

/**
 * Derive a stable, opaque, collision-resistant source ID for a validated
 * URL. The same normalized URL always yields the same ID within and across
 * processes (pure function of the URL string, no per-process salt), so
 * repeated searches and session resume/fork reuse one identity. Returns
 * `undefined` if `url` is not a safe http(s) URL.
 */
export function deriveSourceId(url: string): string | undefined {
  const normalized = normalizeSourceUrl(url);
  if (normalized === undefined) return undefined;
  const hash = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `${SOURCE_ID_PREFIX}${hash}`;
}
