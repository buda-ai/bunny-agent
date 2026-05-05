#!/usr/bin/env node

/**
 * BunnyAgent Runner CLI
 *
 * Subcommands:
 *   bunny-agent run         [options] -- "<user input>"   Run an agent locally
 *   bunny-agent image build [options]                     Build (and optionally push) a Docker image
 */

import { resolve } from "node:path";
// Load environment variables from .env file
import { config } from "dotenv";

// Try loading .env from current directory and project root
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../.env") });
config({ path: resolve(process.cwd(), "../../.env") });

import { parseArgs } from "node:util";
import type { ToolRef } from "@bunny-agent/runner-harness";
import { buildImage } from "./build-image.js";
import { runAgent } from "./runner.js";

/**
 * Read and immediately unset the tool-ref env var the SDK passes through
 * `BunnyAgent.stream`. We unset before any child process can be spawned so the
 * payload (which can contain Bearer tokens or HTTP headers) does not leak via
 * environment inheritance to bash tools the runner may shell out to.
 */
function takeToolRefsFromEnv(): ToolRef[] | null {
  const raw = process.env.BUNNY_AGENT_TOOL_REFS_JSON;
  if (!raw) return null;
  delete process.env.BUNNY_AGENT_TOOL_REFS_JSON;
  try {
    const parsed = JSON.parse(raw) as { tools?: ToolRef[] };
    if (!Array.isArray(parsed.tools)) {
      console.error(
        "[bunny-agent] BUNNY_AGENT_TOOL_REFS_JSON missing tools array; ignoring.",
      );
      return null;
    }
    return parsed.tools;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[bunny-agent] Failed to parse BUNNY_AGENT_TOOL_REFS_JSON: ${message}`,
    );
    return null;
  }
}

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
// `bunny-agent run`
// ---------------------------------------------------------------------------

interface ParsedRunArgs {
  runner: string;
  model: string;
  cwd: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  skillPaths?: string[];
  yolo?: boolean;
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
        default: process.env.BUNNY_AGENT_WORKSPACE ?? process.cwd(),
      },
      "system-prompt": { type: "string", short: "s" },
      "max-turns": { type: "string", short: "t" },
      "allowed-tools": { type: "string", short: "a" },
      "skill-path": { type: "string", multiple: true },
      resume: { type: "string" },
      yolo: { type: "boolean" },
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
    console.error('Usage: bunny-agent run [options] -- "<user input>"');
    process.exit(1);
  }

  const runner = values.runner!;
  if (
    !["claude", "codex", "gemini", "opencode", "copilot", "pi"].includes(runner)
  ) {
    console.error(
      'Error: --runner must be one of: "claude", "codex", "gemini", "opencode", "copilot", "pi"',
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
    skillPaths: values["skill-path"] as string[] | undefined,
    resume: values.resume,
    yolo: values["yolo"],
    userInput,
  };
}

// ---------------------------------------------------------------------------
// `bunny-agent image build`
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
      name: { type: "string", default: "bunny-agent" },
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
🤖 BunnyAgent Runner CLI — run

Runs an agent locally in your terminal, streaming AI SDK UI messages to stdout.

Usage:
  bunny-agent run [options] -- "<user input>"

Options:
  -r, --runner <runner>        Runner: claude, codex, gemini, opencode, copilot, pi (default: claude)
  -m, --model <model>          Model (default: claude-sonnet-4-20250514)
  -c, --cwd <path>             Working directory (default: cwd)
  -s, --system-prompt <prompt> Custom system prompt
  -t, --max-turns <n>          Max conversation turns
  -a, --allowed-tools <tools>  Comma-separated allowed tools
      --skill-path <path>      Additional skill path (can be repeated, for pi runner)
      --resume <session-id>    Resume a previous session
  -h, --help                   Show this help

Environment:
  ANTHROPIC_API_KEY            Anthropic API key (for claude runner)
  OPENAI_API_KEY               OpenAI API key (for codex runner)
  CODEX_API_KEY                OpenAI API key alias (for codex runner)
  GEMINI_API_KEY               Gemini API key (for gemini runner)
  BUNNY_AGENT_WORKSPACE          Default workspace path
`);
}

function printImageBuildHelp(): void {
  console.log(`
🐳 BunnyAgent Runner CLI — image build

Build (and optionally push) a BunnyAgent Docker image.
The image includes Claude Agent SDK + runner-cli pre-installed.

Usage:
  bunny-agent image build [options]

Options:
  --name <name>          Image name, e.g. vikadata/bunny-agent-seo (default: bunny-agent)
  --tag <tag>            Image tag (default: latest)
  --image <full>         Full image name override (e.g. myorg/myimage:v1)
  --platform <plat>      Build platform (default: linux/amd64)
  --template <path>      Path to agent template directory to bake into the image
  --push                 Push image to registry after build
  -h, --help             Show this help

Examples:
  bunny-agent image build --name vikadata/bunny-agent-seo --tag 0.1.0
  bunny-agent image build --name vikadata/bunny-agent-seo --tag 0.1.0 --template ./templates/seo-agent
  bunny-agent image build --name vikadata/bunny-agent-seo --tag 0.1.0 --template ./templates/seo-agent --push
`);
}

function printImageHelp(): void {
  console.log(`
🐳 BunnyAgent Runner CLI — image

Manage BunnyAgent Docker images.

Usage:
  bunny-agent image <subcommand> [options]

Subcommands:
  build    Build (and optionally push) a Docker image

Run "bunny-agent image build --help" for build options.
`);
}

function printGlobalHelp(): void {
  console.log(`
🤖 BunnyAgent Runner CLI

Usage:
  bunny-agent <command> [options]

Commands:
  run          Run an agent locally (streams AI SDK UI messages to stdout)
  image build  Build a BunnyAgent Docker image (with optional --push)

Run "bunny-agent <command> --help" for command-specific options.
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
      const toolRefs = takeToolRefsFromEnv();
      await runAgent({
        runner: args.runner,
        model: args.model,
        userInput: args.userInput,
        systemPrompt: args.systemPrompt,
        maxTurns: args.maxTurns,
        allowedTools: args.allowedTools,
        skillPaths: args.skillPaths,
        resume: args.resume,
        yolo: args.yolo,
        ...(toolRefs ? { toolRefs } : {}),
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
