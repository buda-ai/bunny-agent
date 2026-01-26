/**
 * SandAgent Quickstart Example
 *
 * This example demonstrates how to quickly build an AI agent using SandAgent
 * with LocalSandbox (runs locally, no cloud sandbox needed).
 *
 * Based on the slack-gif-creator skill from Anthropic's skills repository:
 * https://github.com/anthropics/skills/tree/main/skills/slack-gif-creator
 *
 * Usage:
 *   1. Copy .env.example to .env and set ANTHROPIC_API_KEY
 *   2. Run: pnpm start
 */

import "dotenv/config";
import { createSandAgent, LocalSandbox } from "@sandagent/sdk";
import { streamText } from "ai";

async function main() {
  console.log("=== SandAgent Quickstart: Slack GIF Creator ===\n");

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY not set in .env file");
    console.error("Please copy .env.example to .env and set your API key");
    process.exit(1);
  }

  // Create LocalSandbox with isolation
  // LocalSandbox.attach() will automatically copy .claude/ and CLAUDE.md
  // from baseDir to the isolated workdir
  const sandbox = new LocalSandbox({
    baseDir: process.cwd(), // Use current directory as base
    isolate: true, // Isolate each run for safety
    runnerCommand: ["npx", "@sandagent/runner-cli", "run"], // Use npx to run runner-cli
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },
  });

  // Attach will automatically copy .claude/ and CLAUDE.md if isolate: true
  const workdir = sandbox.getWorkdir();
  console.log(`✓ LocalSandbox created (workdir: ${workdir})\n`);

  // Create the SandAgent provider
  // cwd is set to workdir where LocalSandbox automatically copied .claude/ and CLAUDE.md
  const sandagent = createSandAgent({
    sandbox,
    cwd: workdir, // Isolated directory with auto-copied .claude/ and CLAUDE.md
    verbose: true, // Show detailed logs
  });

  // Use Claude Sonnet 4
  const model = "claude-sonnet-4-20250514";

  console.log(`Using model: ${model}\n`);
  console.log(
    "Prompt: Create a simple animated GIF of a bouncing ball for Slack\n",
  );
  console.log("---\n");

  // Stream the response
  const result = streamText({
    model: sandagent(model),
    prompt: `Create a simple animated GIF of a bouncing ball for Slack. 
The GIF should be 128x128 pixels, optimized for Slack emoji use.
Use Python with PIL (Pillow) to create the animation frames and save as a GIF.`,
  });

  // Stream the text output
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log("\n\n=== Complete ===");
  console.log("Check the sandbox workdir for the generated GIF file");
  console.log(`Workdir: ${workdir}`);
}

main().catch(console.error);
