import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type {
  LoadExtensionsResult,
  PromptTemplate,
  ResourceDiagnostic,
  ResourceLoader,
  SettingsManager,
  Skill,
  Theme,
} from "@mariozechner/pi-coding-agent";
import {
  DefaultResourceLoader,
  loadSkills,
} from "@mariozechner/pi-coding-agent";

const LOG_PREFIX = "[bunny-agent:pi]";

function logSkillLoad(
  cwd: string,
  agentDir: string,
  skillPaths: string[],
  result: { skills: Skill[]; diagnostics: ResourceDiagnostic[] },
): void {
  const lines: string[] = [
    `${LOG_PREFIX} loadSkills`,
    `  cwd: ${cwd}`,
    `  agentDir: ${agentDir}`,
    `  extra skillPaths (${skillPaths.length}):`,
  ];
  for (const raw of skillPaths) {
    const abs = isAbsolute(raw) ? raw : resolve(cwd, raw);
    lines.push(
      `    ${raw} -> ${abs} (exists: ${existsSync(abs) ? "yes" : "no"})`,
    );
  }
  lines.push(`  loaded skills: ${result.skills.length}`);
  if (result.skills.length > 0) {
    lines.push(`  skill names: ${result.skills.map((s) => s.name).join(", ")}`);
  }
  if (result.diagnostics.length > 0) {
    lines.push(`  diagnostics (${result.diagnostics.length}):`);
    for (const d of result.diagnostics) {
      const pathPart = d.path !== undefined ? ` path=${d.path}` : "";
      lines.push(`    [${d.type}] ${d.message}${pathPart}`);
    }
  }
  console.error(lines.join("\n"));
}

export interface BunnyAgentResourceLoaderOptions {
  cwd?: string;
  agentDir?: string;
  settingsManager?: SettingsManager;
  /** Additional skill paths (files or directories) */
  skillPaths?: string[];
  /** Extra system prompt to append (e.g. from --system-prompt CLI flag) */
  appendSystemPrompt?: string;
}

/**
 * Custom ResourceLoader for bunny-agent that supports additional skillPaths.
 * Extends DefaultResourceLoader and overrides skill loading.
 */
export class BunnyAgentResourceLoader implements ResourceLoader {
  private delegate: DefaultResourceLoader;
  private skillPaths: string[];
  private cwd: string;
  private agentDir: string;
  private extraAppendPrompt?: string;
  private cachedSkills?: { skills: Skill[]; diagnostics: ResourceDiagnostic[] };

  constructor(options: BunnyAgentResourceLoaderOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.agentDir = options.agentDir ?? join(homedir(), ".pi", "agent");
    this.skillPaths = options.skillPaths ?? [];
    this.extraAppendPrompt = options.appendSystemPrompt;

    // Delegate to DefaultResourceLoader for everything except skills
    this.delegate = new DefaultResourceLoader({
      cwd: this.cwd,
      agentDir: this.agentDir,
      settingsManager: options.settingsManager,
    });
  }

  async reload(): Promise<void> {
    await this.delegate.reload();
    this.cachedSkills = undefined;
  }

  getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] } {
    if (!this.cachedSkills) {
      this.cachedSkills = loadSkills({
        cwd: this.cwd,
        agentDir: this.agentDir,
        skillPaths: this.skillPaths,
      });
      if (this.skillPaths.length > 0) {
        logSkillLoad(
          this.cwd,
          this.agentDir,
          this.skillPaths,
          this.cachedSkills,
        );
      }
    }
    return this.cachedSkills;
  }

  // Delegate all other methods
  getExtensions(): LoadExtensionsResult {
    return this.delegate.getExtensions();
  }

  getPrompts(): {
    prompts: PromptTemplate[];
    diagnostics: ResourceDiagnostic[];
  } {
    return this.delegate.getPrompts();
  }

  getThemes(): { themes: Theme[]; diagnostics: ResourceDiagnostic[] } {
    return this.delegate.getThemes();
  }

  getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> } {
    return this.delegate.getAgentsFiles();
  }

  getSystemPrompt(): string | undefined {
    return this.delegate.getSystemPrompt();
  }

  getAppendSystemPrompt(): string[] {
    const base = this.delegate.getAppendSystemPrompt();
    if (this.extraAppendPrompt) {
      console.error(
        `${LOG_PREFIX} getAppendSystemPrompt: appending extra prompt (${this.extraAppendPrompt.length} chars)`,
      );
      return [...base, this.extraAppendPrompt];
    }
    return base;
  }

  extendResources(
    paths: Parameters<ResourceLoader["extendResources"]>[0],
  ): void {
    this.delegate.extendResources(paths);
  }
}
