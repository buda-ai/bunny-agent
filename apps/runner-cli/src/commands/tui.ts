/**
 * sandagent tui — launch the interactive coding agent TUI
 * Spawns `pi` (pi-mono coding agent) with sandagent branding via piConfig.
 */

import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

export async function tuiCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      model: { type: "string", short: "m" },
      "system-prompt": { type: "string" },
      cwd: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: false, // pass unknown flags through to pi
  });

  if (values.help) {
    console.log(`
sandagent tui — interactive coding agent

Usage:
  sandagent tui [options]

Options:
  -m, --model <model>        Model to use (e.g. anthropic:claude-sonnet-4-5)
  --system-prompt <text>     Override system prompt
  --cwd <path>               Working directory
  -h, --help                 Show this help

All other flags are passed through to the underlying agent.
`);
    return;
  }

  // Build pi args, forwarding everything
  const piArgs: string[] = [];
  if (values.model) piArgs.push("--model", values.model as string);
  if (values["system-prompt"]) piArgs.push("--system-prompt", values["system-prompt"] as string);
  if (values.cwd) piArgs.push("--cwd", values.cwd as string);
  // Forward any extra positionals/flags
  piArgs.push(...positionals);

  const child = spawn("pi", piArgs, {
    stdio: "inherit",
    env: process.env,
  });

  await new Promise<void>((resolve, reject) => {
    child.on("close", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`pi exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
