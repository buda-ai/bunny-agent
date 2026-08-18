import { runAcpOverStdio } from "@bunny-agent/server-acp";

export interface RunAcpOptions {
  runner: string;
  model: string;
  cwd: string;
  yolo?: boolean;
}

/**
 * Serves BunnyAgent as an ACP agent over stdio, so ACP clients (Zed,
 * JetBrains, ...) can spawn this CLI as their agent subprocess.
 */
export async function runAcpAgent(options: RunAcpOptions): Promise<void> {
  await runAcpOverStdio({
    defaultRunner: options.runner,
    defaultModel: options.model,
    defaultCwd: options.cwd,
    yolo: options.yolo,
    env: process.env as Record<string, string>,
  });
}
