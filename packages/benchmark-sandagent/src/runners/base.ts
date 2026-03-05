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
   * Build command for smoking test
   */
  buildCommand(task: SmokingTask): RunnerCommand {
    const command = this.defaults.command;
    const args = [...this.defaults.args];
    
    // Add model BEFORE the -- separator
    const model = process.env.AI_MODEL;
    if (model) {
      // Find the -- separator
      const separatorIndex = args.indexOf("--");
      if (separatorIndex !== -1) {
        // Insert before --
        args.splice(separatorIndex, 0, "-m", model);
      } else {
        // No separator, add at end
        args.push("-m", model);
      }
    }
    
    args.push(task.description);
    
    return { command, args };
  }

  /**
   * Extract answer from output
   */
  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    console.log(`[EXTRACT] Called with type: ${typeof rawOutput}`);
    if (typeof rawOutput === "string") {
      console.log(`[EXTRACT] Processing string of length: ${rawOutput.length}`);
      // Parse AI SDK UI format (NDJSON)
      const lines = rawOutput.split('\n');
      let finalText = "";
      let foundCount = 0;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Skip logs
        if (trimmed.includes('[dotenv@')) continue;
        if (trimmed.includes('[Runner]')) continue;
        
        // Extract text from 0:"text" format
        if (trimmed.startsWith('0:"')) {
          const match = trimmed.match(/^0:"(.*)"/);
          if (match) {
            // Get the last text chunk (most complete)
            finalText = match[1];
            foundCount++;
          }
        }
      }
      
      console.log(`[DEBUG] Found ${foundCount} text chunks, final: "${finalText.substring(0, 50)}..."`);
      
      // If no text found, return raw output (fallback)
      if (!finalText) {
        console.log(`[DEBUG] No text found, returning raw output`);
        return rawOutput.trim();
      }
      
      // Unescape JSON strings
      return finalText.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
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
