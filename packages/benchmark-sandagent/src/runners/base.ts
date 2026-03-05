/**
 * Base Runner for SandAgent Benchmark
 */

import { validateSSEFormat } from "@sandagent/benchmark-shared";
import type { BenchmarkResult, SmokingTask } from "../types.js";
import type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";

/**
 * Base class for sandagent runners
 */
export abstract class BaseRunner implements RunnerHandler {
  abstract readonly name: string;
  abstract readonly defaults: RunnerDefaults;

  /**
   * Add model argument (if configured) and task prompt to command args.
   */
  protected finalizeCommand(
    command: string,
    baseArgs: string[],
    task: SmokingTask,
  ): RunnerCommand {
    const args = [...baseArgs];
    const model = process.env.AI_MODEL;

    if (model) {
      const separatorIndex = args.indexOf("--");
      if (separatorIndex !== -1) {
        args.splice(separatorIndex, 0, "-m", model);
      } else {
        args.push("-m", model);
      }
    }

    args.push(task.description);
    return { command, args };
  }

  /**
   * Build command for smoking test
   */
  buildCommand(task: SmokingTask): RunnerCommand {
    return this.finalizeCommand(
      this.defaults.command,
      this.defaults.args,
      task,
    );
  }

  /**
   * Extract answer from Data Stream Protocol (SSE format)
   * Validates format and extracts text from text-delta events
   */
  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    if (typeof rawOutput === "string") {
      // Validate SSE format
      const validation = validateSSEFormat(rawOutput);
      if (!validation.valid) {
        console.warn("[SSE Validation] Format errors:", validation.errors);
      }

      // Extract text from text-delta events
      const textChunks: string[] = [];
      for (const event of validation.events) {
        if (event.type === "text-delta" && event.delta) {
          textChunks.push(event.delta as string);
        }
      }

      // If no text found, return raw output (fallback)
      if (textChunks.length === 0) {
        return rawOutput.trim();
      }

      return textChunks.join("").trim();
    }

    if (Array.isArray(rawOutput)) {
      return rawOutput.map(String).join("").trim();
    }

    return String(rawOutput).trim();
  }

  /**
   * Extract from common JSON fields
   */
  // biome-ignore lint/suspicious/noExplicitAny: Generic JSON field extraction
  protected extractFromJsonFields(obj: any): string | null {
    const fields = ["answer", "result", "output", "response", "text"];
    for (const field of fields) {
      if (obj[field] && typeof obj[field] === "string") {
        return obj[field].trim();
      }
    }
    return null;
  }
}
