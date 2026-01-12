/**
 * Gemini CLI Runner
 *
 * Handles Google Gemini CLI
 * Reference: gemini_agent.py
 */

import type { GaiaTask, RunnerConfig } from "../types.js";
import type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";

export const geminiCliRunner: RunnerHandler = {
  name: "gemini-cli",

  defaults: {
    command: "gemini",
    args: ["-p"],
    timeout: 300000, // 5 minutes
  },

  buildCommand(task: GaiaTask, config: RunnerConfig): RunnerCommand {
    const command = config.command ?? this.defaults.command;

    let prompt = task.question;
    if (task.files && task.files.length > 0) {
      const fileInfo = task.files
        .map((f) => `[Attached file: ${f.name} at ${f.path}]`)
        .join("\n");
      prompt = `${fileInfo}\n\n${task.question}`;
    }

    // gemini -p <prompt> --output-format json
    return {
      command,
      args: ["-p", prompt, "--output-format", "json"],
    };
  },

  extractAnswer(output: string): string | null {
    // Gemini returns JSON formatted output
    // Skip if it looks like SSE format (handled by sandagent)
    if (output.includes('data: {"type":')) {
      return null;
    }

    // Try to parse as JSON
    try {
      const json = JSON.parse(output);
      // Extract content from JSON response
      if (typeof json === "object" && json !== null) {
        const contentFields = [
          "content",
          "text",
          "output",
          "message",
          "response",
          "result",
        ];
        for (const field of contentFields) {
          if (typeof json[field] === "string") {
            return json[field].trim();
          }
        }
      }
      if (typeof json === "string") {
        return json.trim();
      }
    } catch {
      // Not JSON, try plain text patterns
    }

    // Look for common answer patterns in plain text
    const patterns = [
      /(?:final answer|answer)[:\s]+(.+?)(?:\n|$)/i,
      /(?:the answer is)[:\s]+(.+?)(?:\n|$)/i,
      /(?:result)[:\s]+(.+?)(?:\n|$)/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Return last non-empty line as fallback
    const lines = output
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return lines[lines.length - 1] ?? null;
  },
};
