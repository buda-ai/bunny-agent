/**
 * Codex CLI Runner
 *
 * Handles OpenAI Codex CLI
 * Reference: codex_agent.py
 */

import type { GaiaTask } from "../types.js";
import { BaseRunner } from "./base.js";
import type { RunnerCommand } from "./types.js";
class CodexCliRunner extends BaseRunner {
  readonly name = "codex-cli";
  readonly defaults = {
    command: "codex",
    args: ["exec", "--full-auto", "--color", "never"],
    timeout: 300000, // 5 minutes
  };

  buildCommand(task: GaiaTask): RunnerCommand {
    const command = this.defaults.command;
    const prompt = this.buildPrompt(task);

    const apiKey = process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY;

    // codex exec --full-auto --color never <prompt>
    return {
      command: `CODEX_API_KEY=${apiKey} ${command}`,
      args: ["exec", "--full-auto", "--color", "never", prompt],
    };
  }

  /**
   * Ensure codex-cli is logged in with OPENAI_API_KEY
   */
  async setup(): Promise<boolean> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY;
    if (!apiKey) {
      console.warn(
        "⚠️  OPENAI_API_KEY or CODEX_API_KEY not set, codex-cli may fail to authenticate",
      );
      return false;
    }
    return true;
  }
}

export const codexCliRunner = new CodexCliRunner();
