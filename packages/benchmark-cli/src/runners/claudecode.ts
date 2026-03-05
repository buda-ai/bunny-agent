/**
 * Claude Code Runner
 *
 * Handles Anthropic Claude Code CLI
 * Reference: claude_code_agent.py
 */

import type { GaiaTask } from "../types.js";
import { BaseRunner } from "./base.js";
import type { RunnerCommand } from "./types.js";

class ClaudeCodeRunner extends BaseRunner {
  readonly name = "claudecode";
  readonly defaults = {
    command: "claude",
    args: ["-p"],
    timeout: 300000, // 5 minutes
  };

  buildCommand(task: GaiaTask): RunnerCommand {
    const command = this.defaults.command;
    const prompt = this.buildPrompt(task);

    // claude -p <prompt> --output-format json --tools default --dangerously-skip-permissions
    return {
      command,
      args: [
        "-p",
        prompt,
        "--output-format",
        "json",
        "--tools",
        "default",
        "--dangerously-skip-permissions",
        "--no-session-persistence",
      ],
    };
  }
}

export const claudecodeRunner = new ClaudeCodeRunner();
