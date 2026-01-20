/**
 * Gemini CLI Runner
 *
 * Handles Google Gemini CLI
 * Reference: gemini_agent.py
 */

import type { BenchmarkResult, GaiaTask } from "../types.js";
import { BaseRunner } from "./base.js";
import type { RunnerCommand } from "./types.js";

class GeminiCliRunner extends BaseRunner {
  readonly name = "gemini-cli";
  readonly defaults = {
    command: "gemini",
    args: ["-p"],
    timeout: 300000, // 5 minutes
  };

  buildCommand(task: GaiaTask): RunnerCommand {
    const command = this.defaults.command;
    const prompt = this.buildPrompt(task);

    // gemini -p <prompt> --output-format json
    return {
      command,
      args: ["-p", prompt, "--output-format", "stream-json"],
    };
  }

  extractAnswer(rawOutput: Required<BenchmarkResult["rawOutput"]>): string {
    // Handle string output - try to parse as JSON first
    if (typeof rawOutput === "string") {
      try {
        const json = JSON.parse(rawOutput);
        const result = this.extractFromJsonFields(json);
        if (result) {
          return result;
        }
      } catch {
        // Not JSON, return as-is
        return rawOutput.trim();
      }
    }

    // Handle stream-json format (array of event objects)
    if (Array.isArray(rawOutput)) {
      // Extract all assistant messages and concatenate their content
      const assistantMessages = rawOutput
        .filter(
          (item): item is { type: string; role: string; content: string } =>
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            item.type === "message" &&
            "role" in item &&
            item.role === "assistant" &&
            "content" in item,
        )
        .map((item) => item.content);

      if (assistantMessages.length > 0) {
        return assistantMessages.join("").trim();
      }
    }

    // For arrays or objects, use parent implementation
    return super.extractAnswer(rawOutput);
  }
}

export const geminiCliRunner = new GeminiCliRunner();
