import {
  type ClaudeRunnerOptions,
  createClaudeRunner,
} from "@sandagent/runner-claude";

/**
 * Options for running the agent
 */
export interface RunAgentOptions {
  /** Model to use */
  model: string;
  /** User input/task */
  userInput: string;
  /** Template to use (e.g., "default", "coder", "analyst", "researcher") */
  template?: string;
  /** Custom system prompt (overrides template) */
  systemPrompt?: string;
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Allowed tools */
  allowedTools?: string[];
  /** Resume session ID for multi-turn conversation */
  resume?: string;
  /** Approval file directory for tool approval flow (e.g., "/sandagent/approvals") */
  approvalDir?: string;
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
  const signalHandler = () => {
    console.error("[Runner] Received termination signal, stopping...");
    abortController.abort();
    console.error("[Runner] AbortController.abort() called");
  };

  process.on("SIGTERM", signalHandler);
  process.on("SIGINT", signalHandler);

  console.error("[Runner] Signal handlers registered");

  try {
    // Build runner options - cwd is already set by cli.ts via process.chdir()
    const runnerOptions: ClaudeRunnerOptions = {
      model: options.model,
      systemPrompt: options.systemPrompt,
      maxTurns: options.maxTurns,
      allowedTools: options.allowedTools,
      resume: options.resume,
      approvalDir: options.approvalDir,
    };

    const runner = createClaudeRunner(runnerOptions);

    // Stream AI SDK UI messages to stdout
    for await (const chunk of runner.run(
      options.userInput,
      abortController.signal,
    )) {
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
