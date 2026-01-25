/**
 * Test E2B sandbox with published @sandagent packages
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in API keys
 *   2. Run: pnpm test:e2b
 */

import "dotenv/config";
import { createSandAgent } from "@sandagent/ai-provider";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { streamText } from "ai";

async function main() {
  console.log("=== E2B Sandbox Test (AWS Bedrock) ===\n");

  if (!process.env.E2B_API_KEY) {
    console.error("Error: E2B_API_KEY not set");
    process.exit(1);
  }

  // Check for AWS Bedrock token or Anthropic API key
  const useAWSBedrock = !!process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!useAWSBedrock && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: Either AWS_BEARER_TOKEN_BEDROCK or ANTHROPIC_API_KEY must be set",
    );
    process.exit(1);
  }

  // Create E2B sandbox with custom template
  console.log(
    "Creating E2B sandbox with template: sandagent-claude-researcher...",
  );
  const sandbox = new E2BSandbox({
    template: "sandagent-claude-researcher",
    workdir: "/workspace",
    env: {
      // Pass AWS Bedrock token or Anthropic API key to sandbox
      ...(useAWSBedrock
        ? {
            AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK!,
            CLAUDE_CODE_USE_BEDROCK: "1",
          }
        : { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! }),
    },
  });

  // Create the sandagent provider
  const sandagent = createSandAgent({
    sandbox,
    verbose: true,
  });

  // Use AWS Bedrock model ID or standard Anthropic model ID
  const model = useAWSBedrock
    ? "us.anthropic.claude-sonnet-4-20250514-v1:0" // AWS Bedrock model ID
    : "claude-sonnet-4-20250514"; // Standard Anthropic model ID

  console.log(`Using model: ${model}`);
  console.log(`Provider: ${useAWSBedrock ? "AWS Bedrock" : "Anthropic"}\n`);

  const result = streamText({
    model: sandagent(model),
    prompt: "Write a hello world in Python and run it",
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log("\n\n=== Test Complete ===");
}

main().catch(console.error);
