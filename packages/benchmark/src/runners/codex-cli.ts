/**
 * Codex CLI Runner
 *
 * Handles OpenAI Codex CLI
 * Reference: codex_agent.py
 */

import { spawn } from "node:child_process";
import type { GaiaTask, RunnerConfig } from "../types.js";
import type { RunnerCommand, RunnerDefaults, RunnerHandler } from "./types.js";

/**
 * Execute a command and capture output (for login)
 */
function executeCommand(
  command: string,
  args: string[],
  options: { timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timeoutId = options.timeout
      ? setTimeout(() => {
          proc.kill("SIGTERM");
        }, options.timeout)
      : null;

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    proc.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    });
  });
}

export const codexCliRunner: RunnerHandler = {
  name: "codex-cli",

  defaults: {
    command: "codex",
    args: ["exec", "--full-auto", "--color", "never"],
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

    // codex exec --full-auto --color never <prompt>
    return {
      command,
      args: ["exec", "--full-auto", "--color", "never", prompt],
    };
  },

  extractAnswer(output: string): string | null {
    // Codex returns plain text output
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

  /**
   * Ensure codex-cli is logged in with OPENAI_API_KEY
   */
  async setup(): Promise<boolean> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn(
        "⚠️  OPENAI_API_KEY not set, codex-cli may fail to authenticate",
      );
      return false;
    }

    // Check if already logged in
    const statusResult = await executeCommand("codex", ["login", "status"], {
      timeout: 5000,
    });
    if (statusResult.exitCode === 0) {
      return true;
    }

    // Login with API key via stdin
    console.log("🔑 Logging in to codex-cli with OPENAI_API_KEY...");

    return new Promise((resolve) => {
      const proc = spawn("codex", ["login", "--with-api-key"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          console.log("✅ codex-cli login successful");
          resolve(true);
        } else {
          console.error("❌ codex-cli login failed:", stderr);
          resolve(false);
        }
      });

      proc.on("error", (err) => {
        console.error("❌ codex-cli login error:", err.message);
        resolve(false);
      });

      proc.stdin.write(apiKey);
      proc.stdin.end();
    });
  },
};
