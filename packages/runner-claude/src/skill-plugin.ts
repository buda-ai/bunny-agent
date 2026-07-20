/**
 * Map bunny-agent skill directories to a Claude Agent SDK local plugin.
 *
 * The SDK discovers skills from settings sources and plugins; there is no
 * option that points directly at loose skill directories. Local plugins
 * (`plugins: [{ type: "local", path }]` in sdk.d.ts) load `skills/<name>/
 * SKILL.md` from the plugin directory, so we synthesize a temporary plugin
 * with a minimal `.claude-plugin/plugin.json` manifest and link each skill
 * directory into its `skills/` folder.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const PLUGIN_NAME = "bunny-agent-skills";

/**
 * Create a temporary local plugin wrapping the given skill directories.
 * Each entry in `skillPaths` must be a directory containing a SKILL.md.
 * Returns the plugin directory path, or undefined when there is nothing
 * to wrap or the plugin cannot be created.
 */
export function createSkillPlugin(skillPaths: string[]): string | undefined {
  if (skillPaths.length === 0) return undefined;

  try {
    const pluginDir = mkdtempSync(join(tmpdir(), "bunny-claude-skills-"));
    const manifestDir = join(pluginDir, ".claude-plugin");
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      join(manifestDir, "plugin.json"),
      JSON.stringify(
        {
          name: PLUGIN_NAME,
          version: "0.0.0",
          description: "Bunny Agent skills exposed to the Claude runner",
        },
        null,
        2,
      ),
    );

    const skillsDir = join(pluginDir, "skills");
    mkdirSync(skillsDir, { recursive: true });

    const usedNames = new Set<string>();
    for (const skillPath of skillPaths) {
      let name = basename(skillPath);
      let suffix = 1;
      while (usedNames.has(name)) {
        name = `${basename(skillPath)}-${suffix++}`;
      }
      usedNames.add(name);

      const target = join(skillsDir, name);
      try {
        symlinkSync(skillPath, target, "dir");
      } catch {
        // Fall back to copying when symlinks are unavailable.
        cpSync(skillPath, target, { recursive: true });
      }
    }

    return pluginDir;
  } catch (error) {
    console.error(
      "[ClaudeRunner] Failed to create skill plugin:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}
