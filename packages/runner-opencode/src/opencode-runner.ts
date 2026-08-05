import { createAcpProcessRunner } from "@bunny-agent/runner-acp";

export interface OpenCodeRunnerOptions {
  model?: string;
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  systemPrompt?: string;
  yolo?: boolean;
}

export interface OpenCodeRunner {
  run(userInput: string): AsyncIterable<string>;
  abort(): void;
}

export function createOpenCodeRunner(
  options: OpenCodeRunnerOptions = {},
): OpenCodeRunner {
  const args = ["acp"];
  if (options.model) args.push("--model", options.model);

  return createAcpProcessRunner({
    displayName: "OpenCode",
    command: "opencode",
    args,
    cwd: options.cwd,
    env: options.env,
    abortController: options.abortController,
    systemPrompt: options.systemPrompt,
    yolo: options.yolo,
  });
}
