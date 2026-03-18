import { type RunnerCoreOptions, createRunner } from "@sandagent/runner-core";

export type RunAgentOptions = RunnerCoreOptions;

/**
 * Run the agent, stream AI SDK UI messages to stdout.
 * Handles SIGTERM/SIGINT signals.
 */
export async function runAgent(options: RunAgentOptions): Promise<void> {
  const abortController = new AbortController();
  const signalHandler = () => abortController.abort();
  process.on("SIGTERM", signalHandler);
  process.on("SIGINT", signalHandler);

  try {
    for await (const chunk of createRunner({ ...options, abortController })) {
      process.stdout.write(chunk);
    }
  } finally {
    process.off("SIGTERM", signalHandler);
    process.off("SIGINT", signalHandler);
  }
}
