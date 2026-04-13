/**
 * Session ID persistence: read/write .sandagent/session-id in cwd.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = ".sandagent";
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
