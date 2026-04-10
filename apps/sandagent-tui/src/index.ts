#!/usr/bin/env node
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env") });

const args = process.argv.slice(2);

function flag(name: string, defaultVal: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaultVal;
}

const runner = flag("--runner", "claude");
const model = args.includes("--model") ? flag("--model", "") || undefined : undefined;
const cwd = flag("--cwd", process.cwd());

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
sandagent-tui — interactive coding agent

Usage: sandagent-tui [options]

Options:
  --runner <name>   Runner to use: claude, pi, gemini, codex, opencode (default: claude)
  --model  <name>   Model override (default: runner's default)
  --cwd    <path>   Working directory (default: current directory)
  --help            Show this help
`);
  process.exit(0);
}

const { App } = await import("./app.js");
new App(runner, model, resolve(cwd)).start();
