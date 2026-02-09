#!/usr/bin/env node

/**
 * SandAgent Runner CLI
 *
 * Subcommands:
 *   sandagent run         [options] -- "<user input>"   Run an agent locally
 *   sandagent image build [options]                     Build (and optionally push) a Docker image
 */

import { parseArgs } from "node:util";
import type { OutputFormat } from "@sandagent/runner-claude";
import { buildImage } from "./build-image.js";
import { runAgent } from "./runner.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Get the first positional arg (top-level subcommand). */
function getSubcommand(): string | undefined {
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--") break;
    if (!a.startsWith("-")) return a;
  }
  return undefined;
}

/** Get the second positional arg (sub-subcommand, e.g. "build" in "image build"). */
function getSubSubcommand(): string | undefined {
  let found = 0;
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--") break;
    if (!a.startsWith("-")) {
      found++;
      if (found === 2) return a;
    }
  }
  return undefined;
}

/** Slice process.argv to args after N positionals. */
function argsAfterPositionals(n: number): string[] {
  let found = 0;
  for (let i = 2; i < process.argv.length; i++) {
    if (!process.argv[i].startsWith("-") && process.argv[i] !== "--") {
      found++;
      if (found === n) return process.argv.slice(i + 1);
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// `sandagent run`
// ---------------------------------------------------------------------------

interface ParsedRunArgs {
  runner: string;
  model: string;
  cwd: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  outputFormat?: OutputFormat;
  userInput: string;
}

function parseRunArgs(): ParsedRunArgs {
  const { values, positionals } = parseArgs({
    args: argsAfterPositionals(1),
    options: {
      runner: { type: "string", short: "r", default: "claude" },
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
      "system-prompt": { type: "string", short: "s" },
      "max-turns": { type: "string", short: "t" },
      "allowed-tools": { type: "string", short: "a" },
      resume: { type: "string" },
      "output-format": { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    printRunHelp();
    process.exit(0);
  }

  const dashIndex = process.argv.indexOf("--");
  let userInput = "";
  if (dashIndex !== -1 && dashIndex < process.argv.length - 1) {
    userInput = process.argv.slice(dashIndex + 1).join(" ");
  } else if (positionals.length > 0) {
    userInput = positionals.join(" ");
  }

  if (!userInput) {
    console.error("Error: User input is required");
    console.error('Usage: sandagent run [options] -- "<user input>"');
    process.exit(1);
  }

  const runner = values.runner!;
  if (!["claude", "codex", "copilot"].includes(runner)) {
    console.error(
      'Error: --runner must be one of: "claude", "codex", "copilot"',
    );
    process.exit(1);
  }

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
    runner,
    model: values.model!,
    cwd: values.cwd!,
    systemPrompt: values["system-prompt"],
    maxTurns: values["max-turns"]
      ? Number.parseInt(values["max-turns"], 10)
      : undefined,
    allowedTools: values["allowed-tools"]?.split(",").map((t) => t.trim()),
    resume: values.resume,
    outputFormat: (outputFormat as OutputFormat) ?? "stream",
    userInput,
  };
}

// ---------------------------------------------------------------------------
// `sandagent image build`
// ---------------------------------------------------------------------------

interface ParsedImageBuildArgs {
  name: string;
  tag: string;
  image?: string;
  platform: string;
  template?: string;
  push: boolean;
}

function parseImageBuildArgs(): ParsedImageBuildArgs {
  const { values } = parseArgs({
    args: argsAfterPositionals(2),
    options: {
      name: { type: "string", default: "sandagent" },
      tag: { type: "string", default: "latest" },
      image: { type: "string" },
      platform: { type: "string", default: "linux/amd64" },
      template: { type: "string" },
      push: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    printImageBuildHelp();
    process.exit(0);
  }

  return {
    name: values.name!,
    tag: values.tag!,
    image: values.image,
    platform: values.platform!,
    template: values.template,
    push: values.push ?? false,
  };
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printRunHelp(): void {
  console.log(`
🤖 SandAgent Runner CLI — run

Runs an agent locally in your terminal, streaming AI SDK UI messages to stdout.

Usage:
  sandagent run [options] -- "<user input>"

Options:
  -r, --runner <runner>        Runner: claude, codex, copilot (default: claude)
  -m, --model <model>          Model (default: claude-sonnet-4-20250514)
  -c, --cwd <path>             Working directory (default: cwd)
  -s, --system-prompt <prompt> Custom system prompt
  -t, --max-turns <n>          Max conversation turns
  -a, --allowed-tools <tools>  Comma-separated allowed tools
      --resume <session-id>    Resume a previous session
  -o, --output-format <fmt>    text | json | stream-json | stream (default: stream)
  -h, --help                   Show this help

Environment:
  ANTHROPIC_API_KEY            Anthropic API key (required)
  SANDAGENT_WORKSPACE          Default workspace path
`);
}

function printImageBuildHelp(): void {
  console.log(`
🐳 SandAgent Runner CLI — image build

Build (and optionally push) a SandAgent Docker image.
The image includes Claude Agent SDK + runner-cli pre-installed.

Usage:
  sandagent image build [options]

Options:
  --name <name>          Image name, e.g. vikadata/sandagent-seo (default: sandagent)
  --tag <tag>            Image tag (default: latest)
  --image <full>         Full image name override (e.g. myorg/myimage:v1)
  --platform <plat>      Build platform (default: linux/amd64)
  --template <path>      Path to agent template directory to bake into the image
  --push                 Push image to registry after build
  -h, --help             Show this help

Examples:
  sandagent image build --name vikadata/sandagent-seo --tag 0.1.0
  sandagent image build --name vikadata/sandagent-seo --tag 0.1.0 --template ./templates/seo-agent
  sandagent image build --name vikadata/sandagent-seo --tag 0.1.0 --template ./templates/seo-agent --push
`);
}

function printImageHelp(): void {
  console.log(`
🐳 SandAgent Runner CLI — image

Manage SandAgent Docker images.

Usage:
  sandagent image <subcommand> [options]

Subcommands:
  build    Build (and optionally push) a Docker image

Run "sandagent image build --help" for build options.
`);
}

function printGlobalHelp(): void {
  console.log(`
🤖 SandAgent Runner CLI

Usage:
  sandagent <command> [options]

Commands:
  run          Run an agent locally (streams AI SDK UI messages to stdout)
  image build  Build a SandAgent Docker image (with optional --push)

Run "sandagent <command> --help" for command-specific options.
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const sub = getSubcommand();

  if (!sub || sub === "--help" || sub === "-h") {
    printGlobalHelp();
    process.exit(0);
  }

  switch (sub) {
    case "run": {
      const args = parseRunArgs();
      process.chdir(args.cwd);
      await runAgent({
        runner: args.runner,
        model: args.model,
        userInput: args.userInput,
        systemPrompt: args.systemPrompt,
        maxTurns: args.maxTurns,
        allowedTools: args.allowedTools,
        resume: args.resume,
        outputFormat: args.outputFormat,
      });
      break;
    }
    case "image": {
      const subSub = getSubSubcommand();
      if (!subSub || subSub === "--help" || subSub === "-h") {
        printImageHelp();
        process.exit(0);
      }
      if (subSub === "build") {
        const args = parseImageBuildArgs();
        await buildImage(args);
      } else {
        console.error(`Unknown image subcommand: ${subSub}`);
        printImageHelp();
        process.exit(1);
      }
      break;
    }
    default:
      console.error(`Unknown command: ${sub}`);
      printGlobalHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
