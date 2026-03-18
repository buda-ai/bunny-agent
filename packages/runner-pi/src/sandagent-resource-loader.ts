import { homedir } from "node:os";
import { join } from "node:path";
import type {
  LoadExtensionsResult,
  PathMetadata,
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

export interface SandagentResourceLoaderOptions {
  cwd?: string;
  agentDir?: string;
  settingsManager?: SettingsManager;
  /** Additional skill paths (files or directories) */
  skillPaths?: string[];
  /** Custom system prompt */
  systemPrompt?: string;
}

/**
 * Custom ResourceLoader for sandagent that supports additional skillPaths.
 * Extends DefaultResourceLoader and overrides skill loading.
 */
export class SandagentResourceLoader implements ResourceLoader {
  private delegate: DefaultResourceLoader;
  private skillPaths: string[];
  private cwd: string;
  private agentDir: string;
  private cachedSkills?: { skills: Skill[]; diagnostics: ResourceDiagnostic[] };

  constructor(options: SandagentResourceLoaderOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.agentDir = options.agentDir ?? join(homedir(), ".pi", "agent");
    this.skillPaths = options.skillPaths ?? [];

    // Delegate to DefaultResourceLoader for everything except skills
    this.delegate = new DefaultResourceLoader({
      cwd: this.cwd,
      agentDir: this.agentDir,
      settingsManager: options.settingsManager,
      systemPrompt: options.systemPrompt,
    });
  }

  async reload(): Promise<void> {
    await this.delegate.reload();
    this.cachedSkills = undefined; // Clear cache
  }

  getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] } {
    if (!this.cachedSkills) {
      // Load skills with additional skillPaths
      this.cachedSkills = loadSkills({
        cwd: this.cwd,
        agentDir: this.agentDir,
        skillPaths: this.skillPaths,
      });
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
    return this.delegate.getAppendSystemPrompt();
  }

  getPathMetadata(): Map<string, PathMetadata> {
    return this.delegate.getPathMetadata();
  }

  extendResources(
    paths: Parameters<ResourceLoader["extendResources"]>[0],
  ): void {
    this.delegate.extendResources(paths);
  }
}
