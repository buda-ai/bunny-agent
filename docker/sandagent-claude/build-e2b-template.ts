#!/usr/bin/env node
/**
 * Build E2B template from Dockerfile
 *
 * Usage:
 *   npx tsx build-e2b-template.ts [options]
 *
 * Options:
 *   --alias <name>     Template alias (default: sandagent-claude)
 *   --cpu <count>      CPU cores (default: 2)
 *   --memory <mb>      Memory in MB (default: 2048)
 *   --context <path>   Build context directory (default: current directory)
 *
 * Requires:
 *   - E2B_API_KEY in .env or environment
 *   - @e2b/code-interpreter installed
 *
 * Note: E2B's fromDockerfile() doesn't support build context with COPY commands.
 * For templates with COPY commands, use E2B CLI: e2b template build --path .build-context
 */

import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// Parse command line arguments
function parseArgs() {
  const args: {
    alias: string;
    cpuCount: number;
    memoryMB: number;
    context: string;
    force: boolean;
  } = {
    alias: "sandagent-claude",
    cpuCount: 2,
    memoryMB: 2048,
    context: ".",
    force: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--alias" && i + 1 < process.argv.length) {
      args.alias = process.argv[++i];
    } else if (arg === "--cpu" && i + 1 < process.argv.length) {
      args.cpuCount = Number.parseInt(process.argv[++i], 10);
    } else if (arg === "--memory" && i + 1 < process.argv.length) {
      args.memoryMB = Number.parseInt(process.argv[++i], 10);
    } else if (arg === "--context" && i + 1 < process.argv.length) {
      args.context = process.argv[++i];
    } else if (arg === "--force" || arg === "-f") {
      args.force = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: npx tsx build-e2b-template.ts [options]

Options:
  --alias <name>     Template alias (default: sandagent-claude)
  --cpu <count>      CPU cores (default: 2)
  --memory <mb>      Memory in MB (default: 2048)
  --context <path>   Build context directory (default: current directory)
  --force, -f        Delete existing template before creating
  --help, -h         Show this help message

Environment:
  E2B_API_KEY        Required. Get from https://e2b.dev

Examples:
  npx tsx build-e2b-template.ts --alias sandagent-claude
  npx tsx build-e2b-template.ts --alias sandagent-claude-researcher --context .build-context --force
`);
      process.exit(0);
    }
  }

  return args;
}

async function main() {
  const { alias, cpuCount, memoryMB, context, force } = parseArgs();

  // Check for API key
  if (!process.env.E2B_API_KEY) {
    console.error("Error: E2B_API_KEY not found in environment");
    console.error("Please set it in .env file or export it:");
    console.error("  export E2B_API_KEY=e2b_***");
    process.exit(1);
  }

  // Check for e2b CLI
  try {
    execSync("e2b --version", { stdio: "pipe" });
  } catch {
    console.error("Error: E2B CLI not found");
    console.error("Install it with: npm install -g @e2b/cli");
    process.exit(1);
  }

  const dockerfilePath = join(context, "Dockerfile");
  if (!existsSync(dockerfilePath)) {
    console.error(`Error: Dockerfile not found at ${dockerfilePath}`);
    process.exit(1);
  }

  console.log("📦 E2B Template Builder");
  console.log("=======================");
  console.log(`  Alias: ${alias}`);
  console.log(`  Context: ${context}`);
  console.log(`  CPU: ${cpuCount} cores`);
  console.log(`  Memory: ${memoryMB}MB`);
  console.log(`  Force: ${force}`);
  console.log("");

  // Delete existing template if force mode
  if (force) {
    console.log("🗑️  Deleting existing template (force mode)...");
    try {
      execSync(`e2b template delete "${alias}" --yes`, {
        stdio: "pipe",
        env: { ...process.env, E2B_API_KEY: process.env.E2B_API_KEY },
      });
      console.log(`   Deleted: ${alias}`);
    } catch {
      console.log(`   Template not found or already deleted`);
    }
    console.log("");
  }

  // Use E2B CLI for building (supports COPY commands and build context)
  console.log("🚀 Building E2B template using CLI...");
  console.log("");

  try {
    const cmd = `e2b template build --path "${context}" --name "${alias}" --cpu-count ${cpuCount} --memory-mb ${memoryMB}`;
    console.log(`  Command: ${cmd}`);
    console.log("");

    execSync(cmd, {
      stdio: "inherit",
      env: { ...process.env, E2B_API_KEY: process.env.E2B_API_KEY },
    });

    console.log("");
    console.log("✅ Template built successfully!");
    console.log(`   Alias: ${alias}`);
    console.log("");
    console.log("You can now use this template in SandAgent:");
    console.log(`   template: "${alias}"`);
  } catch (error: unknown) {
    console.error("");
    console.error("❌ Failed to build template");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Failed to build template:", error);
  process.exit(1);
});
