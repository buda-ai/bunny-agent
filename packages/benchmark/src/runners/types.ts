/**
 * Runner Types and Interfaces
 *
 * Shared type definitions for agent CLI runners
 */

import type { GaiaTask } from "../types.js";

/**
 * Command with arguments to execute
 */
export interface RunnerCommand {
  command: string;
  args: string[];
}

/**
 * Default configuration for a runner
 */
export interface RunnerDefaults {
  command: string;
  args: string[];
  timeout: number;
}

/**
 * Result of answer extraction
 */
export interface ExtractedAnswer {
  answer: string;
  confidence?: "high" | "medium" | "low";
}

/**
 * Interface that each runner must implement
 */
export interface RunnerHandler {
  /** Runner identifier */
  readonly name: string;

  /** Default configuration */
  readonly defaults: RunnerDefaults;

  /**
   * Build command to execute for a task
   */
  buildCommand(task: GaiaTask): RunnerCommand;

  /**
   * Extract the final answer from raw output
   * Returns null if this runner cannot handle the output format
   */
  extractAnswer(output: string): string;

  /**
   * Optional: Post-run setup (e.g., login)
   */
  setup?(): Promise<boolean>;
}
