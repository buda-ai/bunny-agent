import type { BaseRunnerOptions } from "@sandagent/runner-claude";
import { createClaudeRunner } from "@sandagent/runner-claude";
import { createCodexRunner } from "@sandagent/runner-codex";
import { createGeminiRunner } from "@sandagent/runner-gemini";
import { createOpenCodeRunner } from "@sandagent/runner-opencode";
import { createPiRunner } from "@sandagent/runner-pi";

export interface RunnerCoreOptions extends BaseRunnerOptions {
  runner: string;
  userInput: string;
  skillPaths?: string[];
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
}

/**
 * Create a runner and return its output as an AsyncIterable<string>.
 * No stdout writing, no signal handling — caller decides what to do with the stream.
 */
export function createRunner(
  options: RunnerCoreOptions,
): AsyncIterable<string> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? (process.env as Record<string, string>);
  const abortController = options.abortController ?? new AbortController();

  const base = {
    model: options.model,
    systemPrompt: options.systemPrompt,
    appendSystemPrompt: options.appendSystemPrompt,
    maxTurns: options.maxTurns,
    allowedTools: options.allowedTools,
    resume: options.resume,
    env,
    abortController,
  };

  switch (options.runner) {
    case "claude":
      return createClaudeRunner(base).run(options.userInput);
    case "codex":
      return createCodexRunner({ ...base, cwd }).run(options.userInput);
    case "gemini":
      return createGeminiRunner({
        model: options.model,
        cwd,
        env,
        abortController,
      }).run(options.userInput);
    case "pi":
      return createPiRunner({
        ...base,
        cwd,
        sessionId: options.resume,
        skillPaths: options.skillPaths,
      }).run(options.userInput);
    case "opencode":
      return createOpenCodeRunner({
        model: options.model,
        cwd,
        env,
        abortController,
      }).run(options.userInput);
    case "copilot":
      throw new Error("Copilot runner not yet implemented");
    default:
      throw new Error(`Unknown runner: ${options.runner}`);
  }
}

export type { BaseRunnerOptions };
