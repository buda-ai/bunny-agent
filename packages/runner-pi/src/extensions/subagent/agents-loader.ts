import {
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";

export type AgentSource = "bundled" | "user" | "project";

export interface AgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
  source: AgentSource;
  filePath: string;
}

export interface AgentDiscoveryOptions {
  cwd: string;
  scope: AgentScope;
  /** Override the directory holding user-level agents (defaults to ~/.bunny/agent/agents). */
  userDir?: string;
  /** Override the bundled-agents directory (defaults to the package's dist/extensions/subagent/agents). */
  bundledDir?: string;
  /** When true, skip bundled defaults entirely (used by tests). */
  skipBundled?: boolean;
}

export interface AgentDiscoveryResult {
  agents: AgentConfig[];
  projectAgentsDir: string | null;
  userAgentsDir: string;
  bundledAgentsDir: string | null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Bundled agents ship inside the package next to the compiled JS so users
 * have working defaults (scout/planner/reviewer/worker) without needing to
 * symlink anything. The build copies *.md from src into dist.
 */
function defaultBundledDir(): string {
  return join(__dirname, "agents");
}

function defaultUserDir(): string {
  return join(homedir(), ".bunny", "agent", "agents");
}

function loadAgentsFromDir(dir: string, source: AgentSource): AgentConfig[] {
  const out: AgentConfig[] = [];
  if (!existsSync(dir)) return out;

  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = join(dir, entry.name);
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(
      content,
    );
    if (!frontmatter.name || !frontmatter.description) continue;

    const tools = frontmatter.tools
      ?.split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    out.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model: frontmatter.model,
      systemPrompt: body,
      source,
      filePath,
    });
  }
  return out;
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk up from cwd looking for a `.bunny/agents` directory. Falls back to
 * `.pi/agents` to stay compatible with repos that already follow the pi-mono
 * convention (no need to keep two copies).
 */
function findNearestProjectAgentsDir(cwd: string): string | null {
  let currentDir = isAbsolute(cwd) ? cwd : resolve(cwd);
  while (true) {
    for (const candidate of [
      join(currentDir, ".bunny", "agents"),
      join(currentDir, ".pi", "agents"),
    ]) {
      if (isDirectory(candidate)) return candidate;
    }
    const parent = dirname(currentDir);
    if (parent === currentDir) return null;
    currentDir = parent;
  }
}

/**
 * Resolve agents available in the current run.
 *
 * Precedence (highest wins): project > user > bundled.
 *   - "user"    scope: bundled + ~/.bunny/agent/agents
 *   - "project" scope: project agents only (no bundled defaults)
 *   - "both"    scope: bundled + user + project, project wins on conflict
 *
 * Bundled defaults are only loaded for "user" / "both"; "project" mode is
 * meant as an explicit opt-in for trusted repos and shouldn't surface our
 * defaults.
 */
export function discoverAgents(
  opts: AgentDiscoveryOptions,
): AgentDiscoveryResult {
  const userDir = opts.userDir ?? defaultUserDir();
  const bundledDir = opts.skipBundled
    ? null
    : (opts.bundledDir ?? defaultBundledDir());
  const projectAgentsDir = findNearestProjectAgentsDir(opts.cwd);

  const bundled =
    opts.scope === "project" || !bundledDir
      ? []
      : loadAgentsFromDir(bundledDir, "bundled");
  const userAgents =
    opts.scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
  const projectAgents =
    opts.scope === "user" || !projectAgentsDir
      ? []
      : loadAgentsFromDir(projectAgentsDir, "project");

  const map = new Map<string, AgentConfig>();
  for (const a of bundled) map.set(a.name, a);
  for (const a of userAgents) map.set(a.name, a);
  for (const a of projectAgents) map.set(a.name, a);

  return {
    agents: Array.from(map.values()),
    projectAgentsDir,
    userAgentsDir: userDir,
    bundledAgentsDir: bundledDir,
  };
}

/**
 * Ensure the user-agents directory exists; called the first time the
 * extension runs so the user has an obvious place to drop their own .md
 * files alongside the bundled defaults.
 */
export function ensureUserAgentsDir(userDir = defaultUserDir()): void {
  try {
    mkdirSync(userDir, { recursive: true });
  } catch {
    // best-effort
  }
}
