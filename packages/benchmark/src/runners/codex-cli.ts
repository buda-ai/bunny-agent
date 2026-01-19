/**
 * Codex CLI Runner
 *
 * Handles OpenAI Codex CLI
 * Reference: codex_agent.py
 */

import type { BenchmarkResult, GaiaTask } from "../types.js";
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
      command,
      args: ["exec", "--json", "--full-auto", "--color", "never", prompt],
      env: apiKey ? { CODEX_API_KEY: apiKey } : undefined,
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

  /**
   * Extract answer from codex-cli NDJSON output
   * Looks for the last agent_message item
   */
  extractAnswer(rawOutput: Required<BenchmarkResult['rawOutput']>): string {
    // Handle string output - parse NDJSON
    if (typeof rawOutput === 'string') {
      const lines = rawOutput.split('\n').filter(line => line.trim());
      let answer = '';
      
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          
          // Look for completed agent_message items
          if (message.type === 'item.completed' && 
              message.item?.type === 'agent_message' && 
              message.item?.text) {
            answer = message.item.text;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
      
      return answer.trim();
    }

    // Handle array output
    if (Array.isArray(rawOutput)) {
      let answer = '';
      
      for (const message of rawOutput) {
        if (typeof message !== 'object' || message === null) {
          continue;
        }
        
        // biome-ignore lint/suspicious/noExplicitAny: message type is dynamic
        const msg = message as any;
        
        // Look for completed agent_message items
        if (msg.type === 'item.completed' && 
            msg.item?.type === 'agent_message' && 
            msg.item?.text) {
          answer = msg.item.text;
        }
      }
      
      return answer.trim();
    }

    // Fallback to base implementation
    return super.extractAnswer(rawOutput);
  }
}

export const codexCliRunner = new CodexCliRunner();
