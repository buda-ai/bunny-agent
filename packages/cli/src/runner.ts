import { createClaudeRunner, type ClaudeRunnerOptions } from "@sandagent/runner-claude";

/**
 * Options for running the agent
 */
export interface RunAgentOptions {
  /** Model to use */
  model: string;
  /** User input/task */
  userInput: string;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Allowed tools */
  allowedTools?: string[];
}

/**
 * Run the agent and stream AI SDK UI messages to stdout.
 *
 * This function:
 * 1. Creates a Claude runner
 * 2. Streams messages directly to stdout
 * 3. Never parses or modifies the output
 *
 * The output is a valid AI SDK UI stream.
 */
export async function runAgent(options: RunAgentOptions): Promise<void> {
  const runnerOptions: ClaudeRunnerOptions = {
    model: options.model,
    systemPrompt: options.systemPrompt,
    maxTurns: options.maxTurns,
    allowedTools: options.allowedTools,
  };

  const runner = createClaudeRunner(runnerOptions);

  // Stream AI SDK UI messages to stdout
  for await (const chunk of runner.run(options.userInput)) {
    // Write directly to stdout without modification
    // This ensures the stream is a valid AI SDK UI stream
    process.stdout.write(chunk);
  }
}
