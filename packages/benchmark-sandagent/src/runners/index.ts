/**
 * Runner Registry for SandAgent Benchmark
 */

import type { SandAgentRunner as RunnerName } from "../types.js";
import { SandAgentRunner } from "./sandagent.js";
import type { RunnerHandler } from "./types.js";

export type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";
export { BaseRunner } from "./base.js";

/**
 * Get a runner by name
 */
export function getRunner(name: RunnerName): RunnerHandler {
  return new SandAgentRunner(name);
}

/**
 * Get all runner names
 */
export function getRunnerNames(): RunnerName[] {
  return ["claude", "pi", "codex", "gemini", "opencode"];
}
