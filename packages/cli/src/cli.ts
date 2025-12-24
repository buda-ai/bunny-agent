#!/usr/bin/env node

/**
 * SandAgent CLI
 *
 * Agent runner that streams AI SDK UI messages to stdout.
 *
 * Usage:
 *   sandagent run [options] -- "<user input>"
 *
 * The CLI is designed to be executed inside a sandbox and outputs
 * AI SDK UI messages directly to stdout for passthrough streaming.
 */

import { parseArgs } from "node:util";
import { runAgent } from "./runner.js";

interface ParsedArgs {
  model: string;
  cwd: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  userInput: string;
}

function parseCliArgs(): ParsedArgs {
  const { values, positionals } = parseArgs({
    options: {
      model: {
        type: "string",
        short: "m",
        default: "claude-sonnet-4-20250514",
      },
      cwd: {
        type: "string",
        short: "c",
        default: process.env.SANDAGENT_WORKSPACE ?? "/workspace",
      },
      "system-prompt": {
        type: "string",
        short: "s",
      },
      "max-turns": {
        type: "string",
        short: "t",
      },
      "allowed-tools": {
        type: "string",
        short: "a",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  // Check for "run" command
  if (positionals[0] !== "run") {
    console.error('Error: Expected "run" command');
    console.error('Usage: sandagent run [options] -- "<user input>"');
    process.exit(1);
  }

  // Get user input from positionals after "--"
  const dashIndex = process.argv.indexOf("--");
  let userInput = "";

  if (dashIndex !== -1 && dashIndex < process.argv.length - 1) {
    userInput = process.argv.slice(dashIndex + 1).join(" ");
  } else if (positionals.length > 1) {
    userInput = positionals.slice(1).join(" ");
  }

  if (!userInput) {
    console.error("Error: User input is required");
    console.error('Usage: sandagent run [options] -- "<user input>"');
    process.exit(1);
  }

  return {
    model: values.model!,
    cwd: values.cwd!,
    systemPrompt: values["system-prompt"],
    maxTurns: values["max-turns"] ? parseInt(values["max-turns"], 10) : undefined,
    allowedTools: values["allowed-tools"]?.split(",").map((t) => t.trim()),
    userInput,
  };
}

function printHelp(): void {
  console.log(`
SandAgent CLI - Agent runner that streams AI SDK UI messages

Usage:
  sandagent run [options] -- "<user input>"

Options:
  -m, --model <model>          Model to use (default: claude-sonnet-4-20250514)
  -c, --cwd <path>             Working directory (default: /workspace)
  -s, --system-prompt <prompt> Custom system prompt
  -t, --max-turns <n>          Maximum conversation turns
  -a, --allowed-tools <tools>  Comma-separated list of allowed tools
  -h, --help                   Show this help message

Environment Variables:
  ANTHROPIC_API_KEY           Anthropic API key (required)
  SANDAGENT_WORKSPACE         Default workspace path
  SANDAGENT_LOG_LEVEL         Logging level (debug, info, warn, error)

Examples:
  sandagent run -- "Create a hello world script"
  sandagent run --model claude-3-5-sonnet -- "Build a weather app"
  sandagent run --cwd /project -- "Fix the bug in main.ts"
`);
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  // Change to the specified working directory
  process.chdir(args.cwd);

  // Run the agent and stream output to stdout
  await runAgent({
    model: args.model,
    userInput: args.userInput,
    systemPrompt: args.systemPrompt,
    maxTurns: args.maxTurns,
    allowedTools: args.allowedTools,
  });
}

main().catch((error) => {
  // Errors go to stderr, not stdout
  console.error("Fatal error:", error.message);
  process.exit(1);
});
