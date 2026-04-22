/**
 * Lightweight session utilities that avoid loading full session files into memory.
 *
 * Pi's SessionManager.list() and SessionManager.open() parse every JSONL entry,
 * which can OOM on large/many session files. These helpers use directory listing
 * and tail-reading to stay O(1) in memory.
 */

import {
  closeSync,
  fstatSync,
  openSync,
  readdirSync,
  readSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";

/** Maximum session file size (bytes) before we skip resume to avoid OOM. */
export const MAX_SESSION_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Resolve a session file path by id without loading/parsing session contents.
 *
 * Pi session files are named `<timestamp>_<id>.jsonl`. This only reads
 * directory entry names — no content parsing.
 *
 * @returns Full path to the session file, or undefined if not found.
 */
export function resolveSessionPathById(
  cwd: string,
  sessionId: string,
): string | undefined {
  const tempMgr = SessionManager.create(cwd);
  const sessionsDir = tempMgr.getSessionDir();
  try {
    const suffix = `_${sessionId}.jsonl`;
    const match = readdirSync(sessionsDir).find((f) => f.endsWith(suffix));
    return match ? join(sessionsDir, match) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if a session file is too large to safely load into memory.
 */
export function isSessionFileTooLarge(sessionPath: string): boolean {
  try {
    return statSync(sessionPath).size > MAX_SESSION_FILE_BYTES;
  } catch {
    return false;
  }
}

/**
 * Extract the last compaction summary from a session file by reading
 * from the end of the file. Avoids loading the entire file into memory.
 *
 * Reads the last ~256KB (enough for any reasonable compaction summary),
 * splits into lines, and finds the last `{"type":"compaction",...}` entry.
 *
 * @returns The compaction summary string, or undefined if none found.
 */
export function extractLastCompactionSummary(
  sessionPath: string,
): string | undefined {
  const TAIL_BYTES = 256 * 1024;
  let fd: number;
  try {
    fd = openSync(sessionPath, "r");
  } catch {
    return undefined;
  }
  try {
    const fileSize = fstatSync(fd).size;
    const readStart = Math.max(0, fileSize - TAIL_BYTES);
    const readLen = fileSize - readStart;
    const buf = Buffer.alloc(readLen);
    readSync(fd, buf, 0, readLen, readStart);

    const tail = buf.toString("utf8");
    const lines = tail.split("\n");

    // Walk backwards to find the last compaction entry
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "compaction" && typeof entry.summary === "string") {
          return entry.summary;
        }
      } catch {
        // not valid JSON, skip
      }
    }
    return undefined;
  } finally {
    closeSync(fd);
  }
}
