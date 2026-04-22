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

/** Maximum session file size (bytes) before we skip resume to avoid OOM.
 *  Override with env var SANDAGENT_MAX_SESSION_BYTES for testing. */
export const MAX_SESSION_FILE_BYTES =
  Number(process.env.SANDAGENT_MAX_SESSION_BYTES) || 10 * 1024 * 1024; // 10 MB

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
 * Reads the last ~1MB (enough for any reasonable compaction summary),
 * splits into lines, and finds the last `{"type":"compaction",...}` entry.
 *
 * @returns The compaction summary string, or undefined if none found.
 */
export function extractLastCompactionSummary(
  sessionPath: string,
): string | undefined {
  const TAIL_BYTES = 1024 * 1024;
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

/**
 * Read the tail of a session file and return parsed JSONL entries.
 * Only reads the last `tailBytes` of the file.
 */
function readTailEntries(
  sessionPath: string,
  tailBytes = 1024 * 1024,
): Array<Record<string, unknown>> {
  let fd: number;
  try {
    fd = openSync(sessionPath, "r");
  } catch {
    return [];
  }
  try {
    const fileSize = fstatSync(fd).size;
    const readStart = Math.max(0, fileSize - tailBytes);
    const readLen = fileSize - readStart;
    const buf = Buffer.alloc(readLen);
    readSync(fd, buf, 0, readLen, readStart);

    const tail = buf.toString("utf8");
    const entries: Array<Record<string, unknown>> = [];
    for (const line of tail.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        // skip partial/invalid lines (first line may be truncated)
      }
    }
    return entries;
  } finally {
    closeSync(fd);
  }
}

/**
 * Extract context from an oversized session file for seeding a new session.
 *
 * Strategy (in priority order):
 * 1. Last compaction summary (best — already a structured context checkpoint)
 * 2. Last few user+assistant message texts (fallback — raw conversation tail)
 *
 * Returns a summary string suitable for `SessionManager.appendCompaction()`,
 * or undefined if no usable context was found.
 */
export function extractSessionContext(sessionPath: string): string | undefined {
  const entries = readTailEntries(sessionPath);
  if (entries.length === 0) return undefined;

  // Priority 1: last compaction summary
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type === "compaction" && typeof e.summary === "string") {
      return e.summary;
    }
  }

  // Priority 2: collect last few user/assistant messages as plain text
  const recentMessages: string[] = [];
  const MAX_MESSAGES = 6; // last 3 turns (user+assistant pairs)
  for (
    let i = entries.length - 1;
    i >= 0 && recentMessages.length < MAX_MESSAGES;
    i--
  ) {
    const e = entries[i];
    if (e.type !== "message") continue;
    const msg = e.message as { role?: string; content?: unknown } | undefined;
    if (!msg) continue;
    if (msg.role !== "user" && msg.role !== "assistant") continue;

    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = (msg.content as Array<{ type?: string; text?: string }>)
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");
    }
    if (text) {
      recentMessages.unshift(`[${msg.role}]: ${text}`);
    }
  }

  if (recentMessages.length === 0) return undefined;

  return (
    "## Previous Session Context (auto-extracted)\n\n" +
    "The following is the tail of the previous conversation:\n\n" +
    recentMessages.join("\n\n")
  );
}
