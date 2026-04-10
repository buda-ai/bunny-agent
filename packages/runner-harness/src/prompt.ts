/**
 * Load system prompt from CLAUDE.md or AGENTS.md, walking up from cwd.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PROMPT_FILES = ["CLAUDE.md", "AGENTS.md"];

export function loadSystemPrompt(cwd: string): string | undefined {
  let dir = cwd;
  // Walk up max 5 levels
  for (let i = 0; i < 5; i++) {
    for (const name of PROMPT_FILES) {
      const p = join(dir, name);
      if (existsSync(p)) {
        try {
          return readFileSync(p, "utf8").trim() || undefined;
        } catch {}
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
