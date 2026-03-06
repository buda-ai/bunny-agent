/**
 * Runner Handler Types
 */

import type { BenchmarkResult, SmokingTask } from "../types.js";

export interface RunnerCommand {
  command: string;
  args: string[];
}

export interface RunnerDefaults {
  command: string;
  args: string[];
  timeout: number;
}

export interface RunnerHandler {
  readonly name: string;
  readonly defaults: RunnerDefaults;
  buildCommand(task: SmokingTask): RunnerCommand;
  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string;
}
