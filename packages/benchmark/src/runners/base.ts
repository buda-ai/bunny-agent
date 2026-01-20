/**
 * Base Runner Class
 *
 * Provides common functionality for all agent CLI runners
 */

import type { BenchmarkResult, GaiaTask } from "../types.js";
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

    const model = process.env.AI_MODEL;
    if (model) {
      // Insert model argument if not already present
      const modelArgIndex = defaultArgs.findIndex(
        (arg) => arg === "--model" || arg === "-m",
      );
      if (modelArgIndex === -1) {
        // Find the position of '--' separator
        const separatorIndex = defaultArgs.findIndex((arg) => arg === "--");
        if (separatorIndex !== -1) {
          // Insert before '--' separator
          defaultArgs.splice(separatorIndex, 0, "--model", model);
        } else {
          // No separator found, append at the end
          defaultArgs.push("--model", model);
        }
      } else {
        // Update existing model argument
        defaultArgs[modelArgIndex + 1] = model;
      }
    }

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
   * Extract answer from raw output
   * Default implementation: return plain text output
   * @param rawOutput - Parsed JSONL output or raw string
   */
  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    if (typeof rawOutput === "string") {
      return rawOutput.trim();
    }

    // For arrays or objects, try to extract answer from common fields
    if (Array.isArray(rawOutput)) {
      // Return last item if it's a string
      const lastItem = rawOutput[rawOutput.length - 1];
      if (typeof lastItem === "string") {
        return lastItem.trim();
      }
      // Try to extract from common fields
      const result = this.extractFromJsonFields(lastItem);
      if (result) {
        return result;
      }
    }

    // For objects, try to extract from common fields
    const result = this.extractFromJsonFields(rawOutput);
    if (result) {
      return result;
    }

    // Fallback: stringify the output
    return String(rawOutput).trim();
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
