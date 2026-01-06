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
 * (e.g., a template directory) and outputs AI SDK UI messages directly.
 */

import { parseArgs } from "node:util";
import { runAgent } from "./runner.js";

interface ParsedArgs {
  model: string;
  cwd: string;
  template: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  parentToolUseId?: string;
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
      template: {
        type: "string",
        short: "T",
        default: process.env.SANDAGENT_TEMPLATE ?? "default",
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
      "parent-tool-use-id": {
        type: "string",
        short: "p",
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
    template: values.template!,
    systemPrompt: values["system-prompt"],
    maxTurns: values["max-turns"]
      ? Number.parseInt(values["max-turns"], 10)
      : undefined,
    allowedTools: values["allowed-tools"]?.split(",").map((t) => t.trim()),
    resume: values.resume,
    parentToolUseId: values["parent-tool-use-id"],
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

  # Or run from a template directory:
  cd templates/coder
  sandagent run -- "Build a REST API"

Options:
  -m, --model <model>          Model to use (default: claude-sonnet-4-20250514)
  -c, --cwd <path>             Working directory (default: current directory)
  -T, --template <name>        Template to use (default: default)
                               Available: default, coder, analyst, researcher
  -s, --system-prompt <prompt> Custom system prompt (overrides template)
  -t, --max-turns <n>          Maximum conversation turns
  -a, --allowed-tools <tools>  Comma-separated list of allowed tools
  -r, --resume <session-id>    Resume a previous session
  -p, --parent-tool-use-id <id> Parent tool use ID for tool result submission
  -h, --help                   Show this help message

Environment Variables:
  ANTHROPIC_API_KEY           Anthropic API key (required)
  SANDAGENT_WORKSPACE         Default workspace path
  SANDAGENT_TEMPLATE          Default template to use
  SANDAGENT_LOG_LEVEL         Logging level (debug, info, warn, error)

Templates:
  default     General-purpose assistant
  coder       Optimized for software development
  analyst     Optimized for data analysis
  researcher  Optimized for research tasks

Examples:
  # Run with default template
  sandagent run -- "Create a hello world script"

  # Run from a template directory (recommended)
  cd templates/coder
  sandagent run -- "Build a REST API with Express"

  # Use a specific template
  sandagent run --template analyst -- "Analyze sales.csv"

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
    template: args.template,
    userInput: args.userInput,
    systemPrompt: args.systemPrompt,
    maxTurns: args.maxTurns,
    allowedTools: args.allowedTools,
    resume: args.resume,
    parentToolUseId: args.parentToolUseId,
  });
}

main().catch((error) => {
  // Errors go to stderr, not stdout
  console.error("Fatal error:", error.message);
  process.exit(1);
});
