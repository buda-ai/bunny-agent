/**
 * Auto-discover skill directories from cwd/skills/ and ~/.bunny-agent/skills/
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function discoverSkillPaths(cwd: string): string[] {
  const paths: string[] = [];

  for (const base of [
    join(cwd, "skills"),
    join(homedir(), ".bunny-agent", "skills"),
  ]) {
    if (!existsSync(base)) continue;
    try {
      for (const entry of readdirSync(base)) {
        const full = join(base, entry);
        if (
          statSync(full).isDirectory() &&
          existsSync(join(full, "SKILL.md"))
        ) {
          paths.push(full);
        }
      }
    } catch {}
  }

  return paths;
}
