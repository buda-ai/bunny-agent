/**
 * OpenCode Runner
 *
 * Handles OpenCode CLI (open-source AI coding agent)
 * https://github.com/opencode-ai/opencode
 */

import type { GaiaTask, RunnerConfig } from "../types.js";
import type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";

export const opencodeRunner: RunnerHandler = {
  name: "opencode",

  defaults: {
    command: "opencode",
    args: ["run"],
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

    // opencode run <message>
    return {
      command,
      args: ["run", prompt],
    };
  },

  extractAnswer(output: string): string | null {
    // OpenCode returns plain text output
    // Skip if it looks like SSE format (handled by sandagent)
    if (output.includes('data: {"type":')) {
      return null;
    }

    // Look for common answer patterns
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
