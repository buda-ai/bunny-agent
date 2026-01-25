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
 *
 * Requires:
 *   - E2B_API_KEY in .env or environment
 *   - @e2b/sdk installed
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import {
  Template,
  defaultBuildLogger,
  waitForTimeout,
} from "@e2b/code-interpreter";

const DOCKERFILE_PATH = join(__dirname, "Dockerfile");

// Parse command line arguments
function parseArgs() {
  const args: {
    alias: string;
    cpuCount: number;
    memoryMB: number;
  } = {
    alias: "sandagent-claude",
    cpuCount: 2,
    memoryMB: 2048,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--alias" && i + 1 < process.argv.length) {
      args.alias = process.argv[++i];
    } else if (arg === "--cpu" && i + 1 < process.argv.length) {
      args.cpuCount = Number.parseInt(process.argv[++i], 10);
    } else if (arg === "--memory" && i + 1 < process.argv.length) {
      args.memoryMB = Number.parseInt(process.argv[++i], 10);
    }
  }

  return args;
}

async function main() {
  const { alias, cpuCount, memoryMB } = parseArgs();

  // Check for API key
  if (!process.env.E2B_API_KEY) {
    console.error("Error: E2B_API_KEY not found in environment");
    console.error("Please set it in .env file or export it:");
    console.error("  export E2B_API_KEY=e2b_***");
    process.exit(1);
  }

  // Read the Dockerfile
  console.log(`Reading Dockerfile from: ${DOCKERFILE_PATH}`);
  const dockerfileContent = readFileSync(DOCKERFILE_PATH, "utf-8");

  // Create template from Dockerfile
  console.log("Creating template from Dockerfile...");
  const template = Template()
    .fromDockerfile(dockerfileContent)
    .setStartCmd("sleep infinity", waitForTimeout(5000));

  // Build the template
  console.log(`Building E2B template...`);
  console.log(`  Alias: ${alias}`);
  console.log(`  CPU: ${cpuCount} cores`);
  console.log(`  Memory: ${memoryMB}MB`);

  const buildInfo = await Template.build(template, {
    alias,
    cpuCount,
    memoryMB,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log("\n✅ Template built successfully!");
  console.log(`   Alias: ${buildInfo.alias}`);
  console.log(`   Template ID: ${buildInfo.templateId}`);
  console.log(`   Build ID: ${buildInfo.buildId}`);
  console.log("\nYou can now use this template in SandAgent:");
  console.log(`   template: "${alias}"`);
  console.log("   skipDependencyInstall: true");
}

main().catch((error) => {
  console.error("Failed to build template:", error);
  process.exit(1);
});
