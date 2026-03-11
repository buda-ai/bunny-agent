import type { BaseRunnerOptions } from "@sandagent/runner-claude";
import { createClaudeRunner } from "@sandagent/runner-claude";
import { createCodexRunner } from "@sandagent/runner-codex";
import { createGeminiRunner } from "@sandagent/runner-gemini";
import { createOpenCodeRunner } from "@sandagent/runner-opencode";
import { createPiRunner } from "@sandagent/runner-pi";

/**
 * Options for running the agent
 * Extends BaseRunnerOptions with CLI-specific fields
 */
export interface RunAgentOptions extends BaseRunnerOptions {
  /** Which runner to use: claude, codex, gemini, opencode, copilot, pi */
  runner: string;
  /** User input/task */
  userInput: string;
  /** Template to use (e.g., "default", "coder", "analyst", "researcher") */
  template?: string;
  /** Additional skill paths (for pi runner) */
  skillPaths?: string[];
}

/**
 * Run the agent and stream AI SDK UI messages to stdout.
 *
 * This function:
 * 1. Uses process.cwd() as project directory (set by cli.ts via --cwd)
 * 2. Creates a Claude runner with settingSources: ["project"]
 * 3. SDK automatically loads CLAUDE.md, .claude/settings.json, .claude/skills/*.skill.md
 * 4. Streams messages directly to stdout
 * 5. Handles SIGTERM/SIGINT signals to gracefully stop the runner
 *
 * The output is a valid AI SDK UI stream.
 */
export async function runAgent(options: RunAgentOptions): Promise<void> {
  // Create an AbortController to handle process signals
  const abortController = new AbortController();

  // Handle SIGTERM and SIGINT signals
  const signalHandler = async () => {
    console.error("[Runner] Received termination signal, stopping...");
    // Note: abort() synchronously triggers all abort event listeners,
    abortController.abort();
    console.error(
      "[Runner] AbortController.abort() completed (listeners triggered)",
    );
  };

  process.on("SIGTERM", signalHandler);
  process.on("SIGINT", signalHandler);

  console.error("[Runner] Signal handlers registered");

  try {
    // Select the appropriate runner based on options.runner
    let runner: { run: (input: string) => AsyncIterable<string> };

    switch (options.runner) {
      case "claude": {
        runner = createClaudeRunner({
          model: options.model,
          systemPrompt: options.systemPrompt,
          maxTurns: options.maxTurns,
          allowedTools: options.allowedTools,
          resume: options.resume,
          env: process.env as Record<string, string>,
          abortController,
        });
        break;
      }
      case "codex": {
        runner = createCodexRunner({
          model: options.model,
          systemPrompt: options.systemPrompt,
          maxTurns: options.maxTurns,
          allowedTools: options.allowedTools,
          resume: options.resume,
          cwd: process.cwd(),
          env: process.env as Record<string, string>,
          abortController,
        });
        break;
      }
      case "copilot":
        throw new Error(
          "Copilot runner not yet implemented. Use --runner=claude for now.",
        );
      case "gemini": {
        runner = createGeminiRunner({
          model: options.model,
          cwd: process.cwd(),
          env: process.env as Record<string, string>,
          abortController,
        });
        break;
      }
      case "pi": {
        runner = createPiRunner({
          model: options.model,
          systemPrompt: options.systemPrompt,
          cwd: process.cwd(),
          env: process.env as Record<string, string>,
          abortController,
          sessionId: options.resume,
          skillPaths: options.skillPaths,
        });
        break;
      }
      case "opencode": {
        runner = createOpenCodeRunner({
          model: options.model,
          cwd: process.cwd(),
          env: process.env as Record<string, string>,
          abortController,
        });
        break;
      }
      default:
        throw new Error(
          `Unknown runner: ${options.runner}. Supported runners: claude, codex, gemini, opencode, copilot, pi`,
        );
    }

    // Stream AI SDK UI messages to stdout
    for await (const chunk of runner.run(options.userInput)) {
      // Write directly to stdout without modification
      // This ensures the stream is a valid AI SDK UI stream
      process.stdout.write(chunk);
    }
  } finally {
    // Clean up signal handlers
    process.off("SIGTERM", signalHandler);
    process.off("SIGINT", signalHandler);
  }
}
