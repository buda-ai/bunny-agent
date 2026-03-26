/**
 * sandagent run command
 *
 * Run an agent task in a sandbox with template support.
 */

import { parseArgs } from "node:util";
import { SandAgent } from "@sandagent/manager";

export async function runCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      template: {
        type: "string",
        short: "t",
        default: process.env.SANDAGENT_TEMPLATE ?? "default",
      },
      sandbox: {
        type: "string",
        short: "s",
        default: process.env.SANDAGENT_SANDBOX ?? "e2b",
      },
      model: {
        type: "string",
        short: "m",
        default: "claude-sonnet-4-20250514",
      },
      workspace: {
        type: "string",
        short: "w",
        default: process.cwd(),
      },
      id: {
        type: "string",
        default: `session-${Date.now()}`,
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    printRunHelp();
    return;
  }

  const task = positionals.join(" ");

  if (!task) {
    console.error("❌ Error: Task description is required");
    console.error('Usage: sandagent run [options] "your task description"');
    process.exit(1);
  }

  // Check for Claude auth (API key or Bedrock proxy)
  const { hasClaudeAuth } = await import("@sandagent/runner-claude");
  if (!hasClaudeAuth()) {
    console.error(
      "❌ Error: Claude auth is required. Set one of: ANTHROPIC_API_KEY, AWS_BEARER_TOKEN_BEDROCK, ANTHROPIC_AUTH_TOKEN, LITELLM_MASTER_KEY, or Bedrock proxy (CLAUDE_CODE_USE_BEDROCK=1 + ANTHROPIC_BEDROCK_BASE_URL)",
    );
    console.error("");
    console.error("Examples:");
    console.error("  export ANTHROPIC_API_KEY=your_api_key");
    console.error("  export ANTHROPIC_AUTH_TOKEN=your_key   # Bedrock proxy");
    console.error(
      "  export ANTHROPIC_BEDROCK_BASE_URL=https://llm.bika.ltd/bedrock",
    );
    console.error("  export CLAUDE_CODE_USE_BEDROCK=1");
    process.exit(1);
  }

  console.log("🚀 Starting SandAgent...");
  console.log("");
  console.log(`  📦 Sandbox:   ${values.sandbox}`);
  console.log(`  📋 Template:  ${values.template}`);
  console.log(`  🤖 Model:     ${values.model}`);
  console.log(`  📁 Workspace: ${values.workspace}`);
  console.log(`  🆔 Session:   ${values.id}`);
  console.log("");
  console.log(`  📝 Task: ${task}`);
  console.log("");
  console.log("---");
  console.log("");

  // Create sandbox adapter
  let sandboxAdapter;
  if (values.sandbox === "e2b") {
    if (!process.env.E2B_API_KEY) {
      console.error(
        "❌ Error: E2B_API_KEY environment variable is required for E2B sandbox",
      );
      console.error("");
      console.error("Set it with:");
      console.error("  export E2B_API_KEY=your_e2b_api_key");
      console.error("");
      console.error("Or use local sandbox instead:");
      console.error("  sandagent run --sandbox local ...");
      process.exit(1);
    }
    const { E2BSandbox } = await import("@sandagent/sandbox-e2b");
    sandboxAdapter = new E2BSandbox();
  } else if (values.sandbox === "sandock") {
    const { SandockSandbox } = await import("@sandagent/sandbox-sandock");
    sandboxAdapter = new SandockSandbox();
  } else if (values.sandbox === "local") {
    const { LocalSandbox } = await import("@sandagent/manager");
    sandboxAdapter = new LocalSandbox({
      workdir: values.workspace,
    });
    console.log(
      "⚠️  Warning: Local sandbox runs commands directly on your machine.",
    );
    console.log("   Use with caution and only with trusted code.");
    console.log("");
  } else {
    console.error(`❌ Error: Unknown sandbox: ${values.sandbox}`);
    console.error("Available sandboxes: e2b, sandock, local");
    process.exit(1);
  }

  // Create and run the agent
  const agent = new SandAgent({
    sandbox: sandboxAdapter,
    runner: {
      model: values.model!,
    },
  });

  const stream = await agent.stream({
    messages: [{ role: "user", content: task }],
    workspace: { path: values.workspace! },
  });

  // Stream the response to stdout
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    process.stdout.write(decoder.decode(value, { stream: true }));
  }

  console.log("");
  console.log("---");
  console.log("");
  console.log("✅ Task completed");
}

function printRunHelp(): void {
  console.log(`
sandagent run - Run an agent task in a sandbox

Usage:
  sandagent run [options] "your task description"

Options:
  -t, --template <name>    Template to use (default: default)
                           Available: default, coder, analyst, researcher
  -s, --sandbox <type>     Sandbox to use: e2b (default), sandock, local
  -m, --model <model>      Model to use (default: claude-sonnet-4-20250514)
  -w, --workspace <path>   Working directory (default: current directory)
  --id <id>                Session ID (default: auto-generated)
  -h, --help               Show this help message

Examples:
  sandagent run "Create a hello world script"
  sandagent run --template coder "Build a REST API"
  sandagent run --sandbox sandock "Run unit tests"
  sandagent run --sandbox local "Run locally without cloud"
  sandagent run --workspace ./my-project "Fix the bug"

Sandbox types:
  e2b         Cloud sandbox using E2B (requires E2B_API_KEY)
  sandock     Docker-based local sandbox
  local       Direct local execution (no isolation, use with caution)

Templates:
  default     General-purpose assistant
  coder       Optimized for software development
  analyst     Optimized for data analysis
  researcher  Optimized for research tasks
`);
}
