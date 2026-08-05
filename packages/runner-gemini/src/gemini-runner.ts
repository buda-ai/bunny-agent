import { createAcpProcessRunner } from "@bunny-agent/runner-acp";

export interface GeminiRunnerOptions {
  model?: string;
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  systemPrompt?: string;
  yolo?: boolean;
}

export interface GeminiRunner {
  run(userInput: string): AsyncIterable<string>;
  abort(): void;
}

export function createGeminiRunner(
  options: GeminiRunnerOptions = {},
): GeminiRunner {
  const args = ["--experimental-acp"];
  if (options.model) args.push("--model", options.model);

  return createAcpProcessRunner({
    displayName: "Gemini",
    command: "gemini",
    args,
    cwd: options.cwd,
    env: options.env,
    abortController: options.abortController,
    systemPrompt: options.systemPrompt,
    yolo: options.yolo,
  });
}
