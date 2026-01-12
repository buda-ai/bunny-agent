/**
 * Runner Registry
 *
 * Exports all runner implementations and provides a registry
 */

import type { AgentRunner } from "../types.js";
import { claudecodeRunner } from "./claudecode.js";
import { codexCliRunner } from "./codex-cli.js";
import { geminiCliRunner } from "./gemini-cli.js";
import { sandagentRunner } from "./sandagent.js";
import type { RunnerHandler } from "./types.js";

export type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";

/**
 * Registry of all available runners
 */
export const runners: Record<AgentRunner, RunnerHandler> = {
  sandagent: sandagentRunner,
  "gemini-cli": geminiCliRunner,
  claudecode: claudecodeRunner,
  "codex-cli": codexCliRunner,
};

/**
 * Get a runner by name
 */
export function getRunner(name: AgentRunner): RunnerHandler {
  const runner = runners[name];
  if (!runner) {
    throw new Error(`Unknown runner: ${name}`);
  }
  return runner;
}

/**
 * Get all runner names
 */
export function getRunnerNames(): AgentRunner[] {
  return Object.keys(runners) as AgentRunner[];
}

// Re-export individual runners for direct import
export { claudecodeRunner } from "./claudecode.js";
export { codexCliRunner } from "./codex-cli.js";
export { geminiCliRunner } from "./gemini-cli.js";
export { sandagentRunner } from "./sandagent.js";
