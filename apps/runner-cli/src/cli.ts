#!/usr/bin/env node

/**
 * SandAgent Runner CLI
 *
 * Like gemini-cli or claude-code - runs locally in your terminal.
 * Streams AI SDK UI messages directly to stdout.
 *
 * Usage:
 *   sandagent run [options] -- "<user input>"
 *
 * The CLI is designed to be executed in a specific working directory
 * and outputs AI SDK UI messages directly.
 */

import { parseArgs } from "node:util";
import type { OutputFormat } from "@sandagent/runner-claude";
import { runAgent } from "./runner.js";

interface ParsedArgs {
  model: string;
  cwd: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  approvalDir?: string;
  outputFormat?: OutputFormat;
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
        default: process.env.SANDAGENT_WORKSPACE ?? process.cwd(),
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
      resume: {
        type: "string",
        short: "r",
      },
      "approval-dir": {
        type: "string",
      },
      "output-format": {
        type: "string",
        short: "o",
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

  // Validate output-format
  const outputFormat = values["output-format"] as OutputFormat | undefined;
  if (
    outputFormat &&
    !["text", "json", "stream-json", "stream"].includes(outputFormat)
  ) {
    console.error(
      'Error: --output-format must be one of: "text", "json", "stream-json", "stream"',
    );
    process.exit(1);
  }

  return {
    model: values.model!,
    cwd: values.cwd!,
    systemPrompt: values["system-prompt"],
    maxTurns: values["max-turns"]
      ? Number.parseInt(values["max-turns"], 10)
      : undefined,
    allowedTools: values["allowed-tools"]?.split(",").map((t) => t.trim()),
    resume: values.resume,
    approvalDir: values["approval-dir"],
    outputFormat: (outputFormat as OutputFormat) ?? "stream",
    userInput,
  };
}

function printHelp(): void {
  console.log(`
🤖 SandAgent Runner CLI

Like gemini-cli or claude-code - runs locally in your terminal.
Streams AI SDK UI messages directly to stdout.

Usage:
  sandagent run [options] -- "<user input>"

Options:
  -m, --model <model>          Model to use (default: claude-sonnet-4-20250514)
  -c, --cwd <path>             Working directory (default: current directory)
  -s, --system-prompt <prompt> Custom system prompt
  -t, --max-turns <n>          Maximum conversation turns
  -a, --allowed-tools <tools>  Comma-separated list of allowed tools
  -r, --resume <session-id>    Resume a previous session
  -o, --output-format <format> Output format (default: stream)
                               Available: text, json(single result), stream-json(realtime streaming), stream(ai sdk ui sse format)
  -h, --help                   Show this help message

Environment Variables:
  ANTHROPIC_API_KEY           Anthropic API key (required)
  SANDAGENT_WORKSPACE         Default workspace path
  SANDAGENT_LOG_LEVEL         Logging level (debug, info, warn, error)

Examples:
  # Run with default settings
  sandagent run -- "Create a hello world script"

  # Run with custom system prompt
  sandagent run --system-prompt "You are a coding assistant" -- "Build a REST API with Express"

  # Specify working directory
  sandagent run --cwd ./my-project -- "Fix the bug in main.ts"
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
    resume: args.resume,
    approvalDir: args.approvalDir,
    outputFormat: args.outputFormat,
  });
}

main().catch((error) => {
  // Errors go to stderr, not stdout
  console.error("Fatal error:", error.message);
  process.exit(1);
});
