#!/usr/bin/env node
/**
 * sandagent — runner CLI
 *
 * Usage:
 *   sandagent run [options] -- "<user input>"
 */

import { parseArgs } from "node:util";
import { runAgent } from "./runner.js";

const subcommand = process.argv[2];

if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  console.log(`
🤖 SandAgent Runner CLI

Usage:
  sandagent run [options] -- "<user input>"

Commands:
  run    Run an agent task

Run 'sandagent run --help' for options.
`);
  process.exit(0);
}

if (subcommand !== "run") {
  console.error(`Unknown command: ${subcommand}`);
  process.exit(1);
}

// Parse run args (everything after "run")
const { values, positionals } = parseArgs({
  args: process.argv.slice(3),
  options: {
    runner:          { type: "string", short: "r", default: "claude" },
    model:           { type: "string", short: "m", default: "claude-sonnet-4-20250514" },
    cwd:             { type: "string", short: "c", default: process.env.SANDAGENT_WORKSPACE ?? process.cwd() },
    "system-prompt": { type: "string", short: "s" },
    "max-turns":     { type: "string", short: "t" },
    "allowed-tools": { type: "string", short: "a" },
    "skill-path":    { type: "string", multiple: true },
    resume:          { type: "string" },
    yolo:            { type: "boolean" },
    help:            { type: "boolean", short: "h" },
  },
  allowPositionals: true,
  strict: true,
});

if (values.help) {
  console.log(`
Usage: sandagent run [options] -- "<user input>"

Options:
  -r, --runner <name>       Runner: claude|pi|gemini|codex|opencode  (default: claude)
  -m, --model  <model>      Model override
  -c, --cwd    <path>       Working directory
  -s, --system-prompt <text> System prompt override
  -t, --max-turns <n>       Max agent turns
  -a, --allowed-tools <csv> Comma-separated allowed tools
      --skill-path <path>   Skill path (repeatable)
      --resume <sessionId>  Resume session
      --yolo                Skip tool approval
`);
  process.exit(0);
}

// User input: after "--" separator or positionals
const dashIndex = process.argv.indexOf("--");
let userInput = "";
if (dashIndex !== -1 && dashIndex < process.argv.length - 1) {
  userInput = process.argv.slice(dashIndex + 1).join(" ");
} else if (positionals.length > 0) {
  userInput = positionals.join(" ");
}

if (!userInput) {
  console.error('Error: user input required. Usage: sandagent run [options] -- "<input>"');
  process.exit(1);
}

await runAgent({
  runner: values.runner!,
  model: values.model!,
  cwd: values.cwd!,
  userInput,
  systemPrompt: values["system-prompt"],
  maxTurns: values["max-turns"] ? Number.parseInt(values["max-turns"], 10) : undefined,
  allowedTools: values["allowed-tools"]?.split(",").map((t) => t.trim()),
  skillPaths: values["skill-path"] as string[] | undefined,
  resume: values.resume,
  yolo: values.yolo,
});
