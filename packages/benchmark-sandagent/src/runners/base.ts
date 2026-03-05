/**
 * Base Runner for SandAgent Benchmark
 */

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
    return this.finalizeCommand(this.defaults.command, this.defaults.args, task);
  }

  /**
   * Extract answer from output
   */
  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    if (typeof rawOutput === "string") {
      // Parse AI SDK UI format (NDJSON)
      const lines = rawOutput.split('\n');
      const textChunks: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Skip logs
        if (trimmed.includes('[dotenv@')) continue;
        if (trimmed.includes('[Runner]')) continue;
        
        // Extract text from 0:<json-string> format and accumulate all chunks.
        if (trimmed.startsWith("0:")) {
          const payload = trimmed.slice(2);
          try {
            const chunk = JSON.parse(payload);
            if (typeof chunk === "string") {
              textChunks.push(chunk);
            }
          } catch {
            // Ignore malformed chunks and continue.
          }
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
