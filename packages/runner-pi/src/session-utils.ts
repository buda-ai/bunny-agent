/** Bounded session discovery and lossless legacy-media migration. */
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fstatSync,
  fsyncSync,
  linkSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

/** Limit applies to JSONL metadata after images are externalized. */
export const MAX_SESSION_FILE_BYTES =
  Number(process.env.SANDAGENT_MAX_SESSION_BYTES) || 10 * 1024 * 1024;

/** Legacy files are parsed one bounded line at a time, never as a whole file. */
export const MAX_LEGACY_SESSION_LINE_BYTES = 64 * 1024 * 1024;

export function resolveSessionPathById(
  cwd: string,
  sessionIdOrPath: string,
): string | undefined {
  if (sessionIdOrPath.includes("/")) return sessionIdOrPath;
  const sessionsDir = SessionManager.create(cwd).getSessionDir();
  try {
    const suffix = `_${sessionIdOrPath}.jsonl`;
    const match = readdirSync(sessionsDir).find((f) => f.endsWith(suffix));
    return match ? join(sessionsDir, match) : undefined;
  } catch {
    return undefined;
  }
}

export function isSessionFileTooLarge(sessionPath: string): boolean {
  try {
    return statSync(sessionPath).size > MAX_SESSION_FILE_BYTES;
  } catch {
    return false;
  }
}

function* readSessionLines(fd: number): Generator<string> {
  const chunk = Buffer.alloc(64 * 1024);
  let parts: Buffer[] = [];
  let lineBytes = 0;
  while (true) {
    const bytesRead = readSync(fd, chunk, 0, chunk.length, null);
    if (bytesRead === 0) break;
    let start = 0;
    for (let i = 0; i < bytesRead; i++) {
      if (chunk[i] !== 10) continue;
      const part = chunk.subarray(start, i);
      lineBytes += part.length;
      if (lineBytes > MAX_LEGACY_SESSION_LINE_BYTES) {
        throw new Error(
          "Session line exceeds the 64 MiB legacy migration limit",
        );
      }
      parts.push(Buffer.from(part));
      yield Buffer.concat(parts, lineBytes).toString("utf8");
      parts = [];
      lineBytes = 0;
      start = i + 1;
    }
    const remainder = chunk.subarray(start, bytesRead);
    lineBytes += remainder.length;
    if (lineBytes > MAX_LEGACY_SESSION_LINE_BYTES) {
      throw new Error("Session line exceeds the 64 MiB legacy migration limit");
    }
    if (remainder.length) parts.push(Buffer.from(remainder));
  }
  if (lineBytes) yield Buffer.concat(parts, lineBytes).toString("utf8");
}

export interface SessionFilePreparation {
  originalBytes: number;
  metadataBytes: number;
  migrated: boolean;
  backupPath?: string;
}

/**
 * The encoder must preserve identity for unchanged entries and never mutate input.
 * Externalize legacy images before Pi opens or forks a transcript. Preserve every
 * entry, ID and parent link; never synthesize a summary from an arbitrary tail.
 * A private hard-link backup retains the original when migration succeeds.
 * On malformed/over-limit data, leave the original intact and fail explicitly.
 */
export function prepareSessionFile(
  sessionPath: string,
  encode: (entry: unknown, sessionPath: string) => unknown,
): SessionFilePreparation {
  const sourceFd = openSync(sessionPath, "r");
  const original = fstatSync(sourceFd);
  const temporaryPath = `${sessionPath}.media-${randomUUID()}.tmp`;
  let targetFd: number | undefined;
  let backupPath: string | undefined;
  let migrated = false;
  let metadataBytes = 0;
  try {
    targetFd = openSync(temporaryPath, "wx", 0o600);
    let lineNumber = 0;
    for (const line of readSessionLines(sourceFd)) {
      lineNumber++;
      if (!line.trim()) continue;
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        throw new Error(`Invalid session JSON at line ${lineNumber}`);
      }
      const encoded = encode(entry, sessionPath);
      const after = JSON.stringify(encoded);
      if (after === undefined)
        throw new Error("Session codec returned no entry");
      migrated ||= encoded !== entry;
      const output = Buffer.from(`${after}\n`);
      metadataBytes += output.length;
      if (metadataBytes > MAX_SESSION_FILE_BYTES) {
        throw new Error(
          `Session metadata exceeds ${MAX_SESSION_FILE_BYTES} bytes after image externalization. ` +
            "The original session is unchanged; increase SANDAGENT_MAX_SESSION_BYTES to resume it. " +
            "No replacement session was created.",
        );
      }
      let offset = 0;
      while (offset < output.length) {
        offset += writeSync(targetFd, output, offset, output.length - offset);
      }
    }
    fsyncSync(targetFd);
    closeSync(targetFd);
    targetFd = undefined;
    const current = statSync(sessionPath);
    if (
      current.ino !== original.ino ||
      current.dev !== original.dev ||
      current.size !== original.size ||
      current.mtimeMs !== original.mtimeMs
    ) {
      throw new Error(
        "Session changed during media migration; retry after the active run finishes",
      );
    }
    if (migrated) {
      backupPath = `${sessionPath}.pre-media-${randomUUID()}.bak`;
      linkSync(sessionPath, backupPath);
      renameSync(temporaryPath, sessionPath);
    }
    return {
      originalBytes: original.size,
      metadataBytes,
      migrated,
      backupPath,
    };
  } finally {
    closeSync(sourceFd);
    if (targetFd !== undefined) closeSync(targetFd);
    rmSync(temporaryPath, { force: true });
  }
}
