/**
 * Runner Registry for SandAgent Benchmark
 */

import type { SandAgentRunner } from "../types.js";
import type { RunnerHandler } from "./types.js";
import { claudeRunner } from "./claude.js";
import { codexRunner } from "./codex.js";
import { geminiRunner } from "./gemini.js";
import { piRunner } from "./pi.js";

export type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";
export { BaseRunner } from "./base.js";

/**
 * Registry of all sandagent runners
 */
export const runners: Record<SandAgentRunner, RunnerHandler> = {
  claude: claudeRunner,
  pi: piRunner,
  codex: codexRunner,
  gemini: geminiRunner,
};

/**
 * Get a runner by name
 */
export function getRunner(name: SandAgentRunner): RunnerHandler {
  const runner = runners[name];
  if (!runner) {
    throw new Error(`Unknown runner: ${name}`);
  }
  return runner;
}

/**
 * Get all runner names
 */
export function getRunnerNames(): SandAgentRunner[] {
  return Object.keys(runners) as SandAgentRunner[];
}
