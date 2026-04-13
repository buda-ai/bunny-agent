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
   * Extract answer from Data Stream Protocol.
   * Primary format is AI SDK UI stream: `data:` lines (validateSSEFormat only handles `data:` lines).
   * Fallback: 0:/d: line format for alternate streams.
   */
  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    if (typeof rawOutput === "string") {
      // Parse SSE format (data: ...)
      const validation = validateSSEFormat(rawOutput);
      if (!validation.valid) {
        console.warn("[SSE Validation] Format errors:", validation.errors);
      }

      const textChunks: string[] = [];
      for (const event of validation.events) {
        if (event.type === "text-delta" && event.delta) {
          textChunks.push(event.delta as string);
        }
      }

      if (textChunks.length > 0) {
        return textChunks.join("").trim();
      }

      // Fallback: 0:/d: line format (non-data: streams)
      const fromAISDKUI = this.extractAnswerFromAISDKUI(rawOutput);
      if (fromAISDKUI !== null) {
        return fromAISDKUI;
      }

      return rawOutput.trim();
    }

    if (Array.isArray(rawOutput)) {
      return rawOutput.map(String).join("").trim();
    }

    return String(rawOutput).trim();
  }

  /**
   * Parse 0:/d: line format and return concatenated text from 0: lines.
   */
  private extractAnswerFromAISDKUI(output: string): string | null {
    const textChunks: string[] = [];
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("0:")) continue;
      const jsonStr = trimmed.slice(2).trim();
      try {
        const value = JSON.parse(jsonStr);
        if (typeof value === "string") {
          textChunks.push(value);
        }
      } catch {
        // ignore malformed lines
      }
    }
    if (textChunks.length === 0) return null;
    return textChunks.join("").trim();
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
