/**
 * Base Runner Class
 *
 * Provides common functionality for all agent CLI runners
 */

import type { GaiaTask } from "../types.js";
import type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";

/**
 * Abstract base class for all runners
 */
export abstract class BaseRunner implements RunnerHandler {
  abstract readonly name: string;
  abstract readonly defaults: RunnerDefaults;

  /**
   * Build command to execute for a task
   * Default implementation: uses defaults.args + prompt
   */
  buildCommand(task: GaiaTask): RunnerCommand {
    const command = this.defaults.command;
    const defaultArgs = this.defaults.args ?? [];
    const prompt = this.buildPrompt(task);

    return {
      command,
      args: [...defaultArgs, prompt],
    };
  }

  /**
   * Build prompt from task (with file attachments)
   */
  protected buildPrompt(task: GaiaTask): string {
    let prompt = task.question;
    if (task.files && task.files.length > 0) {
      const fileInfo = task.files
        .map((f) => `[Attached file: ${f.name} at ${f.path}]`)
        .join("\n");
      prompt = `${fileInfo}\n\n${task.question}`;
    }
    return prompt;
  }

  /**
   * Extract answer from output
   * Default implementation: return plain text output
   */
  extractAnswer(output: string): string {
    if (!output || !output.trim()) {
      return "";
    }

    // Skip SSE format (should be handled by specific runners)
    if (this.isSSEFormat(output)) {
      return "";
    }

    // Return plain text output
    return output.trim();
  }

  /**
   * Check if output is in SSE format
   */
  protected isSSEFormat(output: string): boolean {
    return output.includes('data: {"type":');
  }

  /**
   * Extract common JSON fields
   * Used by runners that output JSON format
   */
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  protected extractFromJsonFields(json: any): string | null {
    if (!json) {
      return null;
    }

    // If JSON is a string, return it
    if (typeof json === "string") {
      return json.trim();
    }

    // Extract from common fields (aligned with extract_answer_from_code)
    if (typeof json === "object" && json !== null) {
      const result =
        json.result ||
        json.answer ||
        json.text ||
        json.content ||
        json.response ||
        json.output;

      if (result) {
        return String(result).trim();
      }
    }

    return String(json);
  }

  /**
   * Optional setup method (e.g., login)
   */
  async setup?(): Promise<boolean>;
}
