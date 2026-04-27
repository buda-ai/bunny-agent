#!/usr/bin/env node

/**
 * BunnyAgent Manager CLI
 *
 * A command-line tool for managing BunnyAgent sandboxes, running agents
 * with templates, and controlling sessions.
 *
 * This is the CLI equivalent of the bunny-agent-example web app.
 *
 * Commands:
 *   bunny-agent-manager run [options]      - Run an agent task in a sandbox
 *   bunny-agent-manager list               - List running sandboxes
 *   bunny-agent-manager stop <id>          - Stop a sandbox
 *   bunny-agent-manager templates          - List available templates
 *   bunny-agent-manager info               - Show environment and configuration
 */

import { infoCommand } from "./commands/info.js";
import { listCommand } from "./commands/list.js";
import { runCommand } from "./commands/run.js";
import { stopCommand } from "./commands/stop.js";
import { templatesCommand } from "./commands/templates.js";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`
🚀 BunnyAgent Manager CLI v${VERSION}

Turn powerful coding agents into universal Super Agents.
Run AI agents in sandboxed environments with AI SDK UI streaming.

Usage:
  bunny-agent-manager <command> [options]

Commands:
  run          Run an agent task in a sandbox
  list         List running sandboxes
  stop <id>    Stop a sandbox by ID
  templates    List available agent templates
  info         Show environment and configuration

Quick Start:
  # Run a task with the default template
  bunny-agent-manager run "Create a hello world script"

  # Run with a specific template
  bunny-agent-manager run --template coder "Build a REST API"

  # Run in a specific workspace
  bunny-agent-manager run --workspace ./my-project "Fix the bug in main.ts"

Options:
  -h, --help       Show this help message
  -v, --version    Show version number

Examples:
  bunny-agent-manager run "Create a weather script"
  bunny-agent-manager run --template coder "Build a REST API with Express"
  bunny-agent-manager run --template analyst "Analyze sales.csv and create a report"
  bunny-agent-manager run --template researcher "Research the latest AI trends"
  bunny-agent-manager run --sandbox e2b "Deploy this to production"
  bunny-agent-manager run --sandbox sandock "Run unit tests"
  bunny-agent-manager list
  bunny-agent-manager stop session-123
  bunny-agent-manager templates
  bunny-agent-manager info

Environment Variables:
  ANTHROPIC_API_KEY    Anthropic API key (required)
  E2B_API_KEY          E2B API key (for E2B sandbox)
  DOCKER_HOST          Docker host URL (for Sandock sandbox)
  BUNNY_AGENT_TEMPLATE   Default template to use
  BUNNY_AGENT_SANDBOX    Default sandbox to use (e2b or sandock)

Documentation:
  https://github.com/vikadata/bunny-agent

Enjoy building with BunnyAgent! 🤖
`);
}

function printVersion(): void {
  console.log(`bunny-agent v${VERSION}`);
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
        console.error('Run "bunny-agent --help" for usage information.');
        process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error: ${message}`);
    process.exit(1);
  }
}

main();
