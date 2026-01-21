import {
  type BaseRunnerOptions,
  type ClaudeRunnerOptions,
  createClaudeRunner,
} from "@sandagent/runner-claude";

/**
 * Options for running the agent
 * Extends BaseRunnerOptions with CLI-specific fields
 */
export interface RunAgentOptions extends BaseRunnerOptions {
  /** Which runner to use: claude, codex, copilot */
  runner: string;
  /** User input/task */
  userInput: string;
  /** Template to use (e.g., "default", "coder", "analyst", "researcher") */
  template?: string;
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
        // Build runner options - cwd is already set by cli.ts via process.chdir()
        const runnerOptions: ClaudeRunnerOptions = {
          model: options.model,
          systemPrompt: options.systemPrompt,
          maxTurns: options.maxTurns,
          allowedTools: options.allowedTools,
          resume: options.resume,
          approvalDir: options.approvalDir,
          outputFormat: options.outputFormat,
          abortController: abortController,
        };
        runner = createClaudeRunner(runnerOptions);
        break;
      }
      case "codex":
        // TODO: Implement Codex runner
        throw new Error(
          "Codex runner not yet implemented. Use --runner=claude for now.",
        );
      case "copilot":
        // TODO: Implement Copilot runner
        throw new Error(
          "Copilot runner not yet implemented. Use --runner=claude for now.",
        );
      default:
        throw new Error(
          `Unknown runner: ${options.runner}. Supported runners: claude, codex, copilot`,
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
