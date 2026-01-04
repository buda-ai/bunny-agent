import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ClaudeRunnerOptions,
  createClaudeRunner,
} from "@sandagent/runner-claude";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Options for running the agent
 */
export interface RunAgentOptions {
  /** Model to use */
  model: string;
  /** User input/task */
  userInput: string;
  /** Template to use (e.g., "default", "coder", "analyst", "researcher") */
  template?: string;
  /** Custom system prompt (overrides template) */
  systemPrompt?: string;
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Allowed tools */
  allowedTools?: string[];
  /** Resume session ID for multi-turn conversation */
  resume?: string;
}

/**
 * Template settings loaded from .claude/settings.json
 */
interface TemplateSettings {
  max_tokens?: number;
  temperature?: number;
  allowed_tools?: string[];
  timeout_ms?: number;
  max_turns?: number;
  streaming?: boolean;
}

/**
 * Find the templates directory
 * Searches in order:
 * 1. SANDAGENT_TEMPLATES_DIR environment variable
 * 2. /sandagent/templates (standard sandbox location)
 * 3. Relative to the CLI package (for development)
 */
function findTemplatesDir(): string | null {
  const envPath = process.env.SANDAGENT_TEMPLATES_DIR;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  // Standard sandbox location
  const sandboxPath = "/sandagent/templates";
  if (fs.existsSync(sandboxPath)) {
    return sandboxPath;
  }

  // Development: relative to this file
  // When built, this file is at apps/runner-cli/dist/runner.js
  // Templates are at the repo root: templates/
  const devPath = path.resolve(__dirname, "../../../templates");
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  return null;
}

/**
 * Load template configuration
 */
function loadTemplate(templateName: string): {
  systemPrompt?: string;
  settings?: TemplateSettings;
} {
  const templatesDir = findTemplatesDir();
  if (!templatesDir) {
    // Templates not found, return empty config
    return {};
  }

  const templateDir = path.join(templatesDir, templateName);
  if (!fs.existsSync(templateDir)) {
    // Template doesn't exist, try default
    if (templateName !== "default") {
      console.error(
        `Warning: Template "${templateName}" not found, using default`,
      );
      return loadTemplate("default");
    }
    return {};
  }

  let systemPrompt: string | undefined;
  let settings: TemplateSettings | undefined;

  // Load CLAUDE.md as system prompt
  const claudeMdPath = path.join(templateDir, "CLAUDE.md");
  if (fs.existsSync(claudeMdPath)) {
    systemPrompt = fs.readFileSync(claudeMdPath, "utf-8");
  }

  // Load .claude/settings.json
  const settingsPath = path.join(templateDir, ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const settingsContent = fs.readFileSync(settingsPath, "utf-8");
      settings = JSON.parse(settingsContent) as TemplateSettings;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `Warning: Failed to parse ${settingsPath}: ${errorMessage}`,
      );
    }
  }

  // Load skills (if any) and append to system prompt
  const skillsDir = path.join(templateDir, "skills");
  if (fs.existsSync(skillsDir)) {
    try {
      const skillFiles = fs
        .readdirSync(skillsDir)
        .filter((f) => f.endsWith(".md"));
      if (skillFiles.length > 0) {
        const skillsContent = skillFiles
          .map((file) => {
            const content = fs.readFileSync(
              path.join(skillsDir, file),
              "utf-8",
            );
            return `\n---\n\n${content}`;
          })
          .join("\n");

        if (systemPrompt) {
          systemPrompt += `\n\n## Skills\n${skillsContent}`;
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `Warning: Failed to load skills from ${skillsDir}: ${errorMessage}`,
      );
    }
  }

  return { systemPrompt, settings };
}

/**
 * Run the agent and stream AI SDK UI messages to stdout.
 *
 * This function:
 * 1. Loads template configuration (if specified)
 * 2. Creates a Claude runner
 * 3. Streams messages directly to stdout
 * 4. Never parses or modifies the output
 *
 * The output is a valid AI SDK UI stream.
 */
export async function runAgent(options: RunAgentOptions): Promise<void> {
  // Load template configuration
  const template = loadTemplate(options.template ?? "default");

  // Build runner options, with explicit options overriding template
  const runnerOptions: ClaudeRunnerOptions = {
    model: options.model,
    // Explicit system prompt overrides template
    systemPrompt: options.systemPrompt ?? template.systemPrompt,
    // Explicit maxTurns overrides template
    maxTurns: options.maxTurns ?? template.settings?.max_turns,
    // Explicit allowedTools overrides template
    allowedTools: options.allowedTools ?? template.settings?.allowed_tools,
    // Resume session for multi-turn conversation
    resume: options.resume,
  };

  const runner = createClaudeRunner(runnerOptions);

  // Stream AI SDK UI messages to stdout
  for await (const chunk of runner.run(options.userInput)) {
    // Write directly to stdout without modification
    // This ensures the stream is a valid AI SDK UI stream
    process.stdout.write(chunk);
  }
}
