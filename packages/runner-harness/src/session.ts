/**
 * Session ID persistence: read/write .bunny-agent/session-id in cwd.
 * Session path cache: read/write .bunny-agent/pi-sessions.json in cwd
 * (maps sessionId → absolute sessionFile path so the pi-runner can open
 * a session directly via SessionManager.open(path) without the expensive
 * SessionManager.list() full-scan that can OOM under tight heap limits).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = ".bunny-agent";
const FILE = "session-id";

function sessionPath(cwd: string): string {
  return join(cwd, DIR, FILE);
}

export function readSessionId(cwd: string): string | undefined {
  try {
    const p = sessionPath(cwd);
    if (!existsSync(p)) return undefined;
    return readFileSync(p, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export function writeSessionId(cwd: string, id: string): void {
  try {
    mkdirSync(join(cwd, DIR), { recursive: true });
    writeFileSync(sessionPath(cwd), id, "utf8");
  } catch {}
}

export function clearSessionId(cwd: string): void {
  try {
    const p = sessionPath(cwd);
    if (existsSync(p)) writeFileSync(p, "", "utf8");
  } catch {}
}

// ---------------------------------------------------------------------------
// Session path cache: .bunny-agent/pi-sessions.json
// Maps sessionId (short string) → absolute sessionFile path.
// Used by the pi-runner to avoid the expensive SessionManager.list() scan.
// ---------------------------------------------------------------------------

const PI_SESSIONS_FILE = "pi-sessions.json";

function piSessionsPath(cwd: string): string {
  return join(cwd, DIR, PI_SESSIONS_FILE);
}

function readPiSessionsMap(cwd: string): Record<string, string> {
  try {
    const p = piSessionsPath(cwd);
    if (!existsSync(p)) return {};
    const raw = readFileSync(p, "utf8").trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Look up the session file path for a given session ID from the local cache.
 * Returns undefined if not cached.
 */
export function lookupSessionFilePath(
  cwd: string,
  sessionId: string,
): string | undefined {
  const map = readPiSessionsMap(cwd);
  const path = map[sessionId];
  return typeof path === "string" && path.length > 0 ? path : undefined;
}

/**
 * Persist a sessionId → sessionFile mapping into the local cache so future
 * runs can resolve the path without calling SessionManager.list().
 */
export function cacheSessionFilePath(
  cwd: string,
  sessionId: string,
  sessionFile: string,
): void {
  try {
    mkdirSync(join(cwd, DIR), { recursive: true });
    const map = readPiSessionsMap(cwd);
    map[sessionId] = sessionFile;
    writeFileSync(piSessionsPath(cwd), JSON.stringify(map, null, 2), "utf8");
  } catch {}
}
