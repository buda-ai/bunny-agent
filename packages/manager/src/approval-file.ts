import { createHash } from "node:crypto";

const LEGACY_APPROVAL_FILE_STEM_MAX_BYTES = 200;
const SAFE_APPROVAL_FILE_STEM = /^[A-Za-z0-9._-]+$/;

/**
 * Return the shared approval filename for a tool call.
 *
 * Normal tool call IDs keep their legacy filenames. IDs containing path
 * separators, unsafe characters, or unusually long byte sequences use a
 * deterministic SHA-256 filename so every runner and SDK client resolves the
 * same file without exceeding filesystem component limits.
 */
export function approvalFileName(toolCallId: string): string {
  const useLegacyName =
    SAFE_APPROVAL_FILE_STEM.test(toolCallId) &&
    Buffer.byteLength(toolCallId, "utf8") <= LEGACY_APPROVAL_FILE_STEM_MAX_BYTES;

  const stem = useLegacyName
    ? toolCallId
    : `hashed-${createHash("sha256").update(toolCallId).digest("hex")}`;

  return `${stem}.json`;
}
