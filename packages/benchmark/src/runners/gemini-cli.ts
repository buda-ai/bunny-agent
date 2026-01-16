/**
 * Gemini CLI Runner
 *
 * Handles Google Gemini CLI
 * Reference: gemini_agent.py
 */

import type { GaiaTask } from "../types.js";
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
      args: ["-p", prompt, "--output-format", "json"],
    };
  }

  extractAnswer(output: string): string {
    // Try to parse as JSON
    try {
      const json = JSON.parse(output);
      const result = this.extractFromJsonFields(json);
      if (result) {
        return result;
      }
    } catch {
      // Not JSON, fall back to base extraction
    }
    // Fallback to base extraction (plain text)
    return super.extractAnswer(output);
  }
}

export const geminiCliRunner = new GeminiCliRunner();
