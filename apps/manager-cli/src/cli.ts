#!/usr/bin/env node

/**
 * SandAgent Manager CLI
 *
 * A command-line tool for managing SandAgent sandboxes, running agents
 * with templates, and controlling sessions.
 *
 * This is the CLI equivalent of the sandagent-example web app.
 *
 * Commands:
 *   sandagent-manager run [options]      - Run an agent task in a sandbox
 *   sandagent-manager list               - List running sandboxes
 *   sandagent-manager stop <id>          - Stop a sandbox
 *   sandagent-manager templates          - List available templates
 *   sandagent-manager info               - Show environment and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { infoCommand } from "./commands/info.js";
import { listCommand } from "./commands/list.js";
import { runCommand } from "./commands/run.js";
import { stopCommand } from "./commands/stop.js";
import { templatesCommand } from "./commands/templates.js";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`
🚀 SandAgent Manager CLI v${VERSION}

Turn powerful coding agents into universal Super Agents.
Run AI agents in sandboxed environments with AI SDK UI streaming.

Usage:
  sandagent-manager <command> [options]

Commands:
  run          Run an agent task in a sandbox
  list         List running sandboxes
  stop <id>    Stop a sandbox by ID
  templates    List available agent templates
  info         Show environment and configuration

Quick Start:
  # Run a task with the default template
  sandagent-manager run "Create a hello world script"

  # Run with a specific template
  sandagent-manager run --template coder "Build a REST API"

  # Run in a specific workspace
  sandagent-manager run --workspace ./my-project "Fix the bug in main.ts"

Options:
  -h, --help       Show this help message
  -v, --version    Show version number

Examples:
  sandagent-manager run "Create a weather script"
  sandagent-manager run --template coder "Build a REST API with Express"
  sandagent-manager run --template analyst "Analyze sales.csv and create a report"
  sandagent-manager run --template researcher "Research the latest AI trends"
  sandagent-manager run --sandbox e2b "Deploy this to production"
  sandagent-manager run --sandbox sandock "Run unit tests"
  sandagent-manager list
  sandagent-manager stop session-123
  sandagent-manager templates
  sandagent-manager info

Environment Variables:
  ANTHROPIC_API_KEY    Anthropic API key (required)
  E2B_API_KEY          E2B API key (for E2B sandbox)
  DOCKER_HOST          Docker host URL (for Sandock sandbox)
  SANDAGENT_TEMPLATE   Default template to use
  SANDAGENT_SANDBOX    Default sandbox to use (e2b or sandock)

Documentation:
  https://github.com/vikadata/sandagent

Enjoy building with SandAgent! 🤖
`);
}

function printVersion(): void {
  console.log(`sandagent v${VERSION}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    printHelp();
    process.exit(0);
  }

  if (args[0] === "-v" || args[0] === "--version") {
    printVersion();
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case "run":
        await runCommand(args.slice(1));
        break;
      case "list":
        await listCommand(args.slice(1));
        break;
      case "stop":
        await stopCommand(args.slice(1));
        break;
      case "templates":
        await templatesCommand(args.slice(1));
        break;
      case "info":
        await infoCommand(args.slice(1));
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.error('Run "sandagent --help" for usage information.');
        process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error: ${message}`);
    process.exit(1);
  }
}

main();
