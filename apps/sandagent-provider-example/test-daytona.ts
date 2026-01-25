/**
 * Test Daytona sandbox with published @sandagent packages
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in API keys
 *   2. Run: pnpm test:daytona
 */

import "dotenv/config";
import { SandAgent } from "@sandagent/manager";
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";
import { sandagent } from "@sandagent/ai-provider";
import { streamText } from "ai";

async function main() {
  console.log("=== Daytona Sandbox Test ===\n");

  if (!process.env.DAYTONA_API_KEY) {
    console.error("Error: DAYTONA_API_KEY not set");
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  // Create Daytona sandbox with custom snapshot
  console.log("Creating Daytona sandbox with snapshot: sandagent-claude-researcher:0.1.2...");
  const sandbox = new DaytonaSandbox({
    snapshot: "sandagent-claude-researcher:0.1.2",
    volumeName: "test-volume",
    workdir: "/workspace",
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  });

  const agent = new SandAgent({ sandbox });

  console.log("Testing with Claude...\n");

  const result = streamText({
    model: sandagent(agent, "claude-sonnet-4-20250514"),
    prompt: "Write a hello world in Python and run it",
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log("\n\n=== Test Complete ===");
}

main().catch(console.error);
