/**
 * bunny-agent-manager info command
 *
 * Show environment and configuration information.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

export async function infoCommand(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    console.log(`
bunny-agent-manager info - Show environment and configuration

Usage:
  bunny-agent-manager info

This command displays your BunnyAgent configuration and environment status.
`);
    return;
  }

  const { hasClaudeAuth } = await import("@bunny-agent/runner-claude");
  const hasClaudeAuthSet = hasClaudeAuth();
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasE2BKey = !!process.env.E2B_API_KEY;
  const dockerHost = process.env.DOCKER_HOST || "unix:///var/run/docker.sock";

  console.log("ℹ️  BunnyAgent Configuration");
  console.log("");
  console.log("Environment:");
  console.log(`  Node.js:           ${process.version}`);
  console.log(`  Platform:          ${process.platform} ${process.arch}`);
  console.log(`  Working Directory: ${process.cwd()}`);
  console.log("");
  console.log("API Keys / Claude auth:");
  console.log(
    `  ANTHROPIC_API_KEY:           ${hasAnthropicKey ? "✅ Set" : "❌ Not set"}`,
  );
  console.log(
    `  ANTHROPIC_AUTH_TOKEN:         ${process.env.ANTHROPIC_AUTH_TOKEN ? "✅ Set" : "❌ Not set"} (Bedrock proxy)`,
  );
  console.log(
    `  LITELLM_MASTER_KEY:          ${process.env.LITELLM_MASTER_KEY ? "✅ Set" : "❌ Not set"} (Bedrock proxy)`,
  );
  console.log(
    `  AWS_BEARER_TOKEN_BEDROCK:    ${process.env.AWS_BEARER_TOKEN_BEDROCK ? "✅ Set" : "❌ Not set"}`,
  );
  console.log(
    `  ANTHROPIC_BEDROCK_BASE_URL:  ${process.env.ANTHROPIC_BEDROCK_BASE_URL || "❌ Not set"}`,
  );
  console.log(
    `  CLAUDE_CODE_USE_BEDROCK:     ${process.env.CLAUDE_CODE_USE_BEDROCK || "❌ Not set"}`,
  );
  console.log(
    `  Claude auth (any of above):  ${hasClaudeAuthSet ? "✅ Ready" : "❌ Not set (required)"}`,
  );
  console.log(
    `  E2B_API_KEY:                 ${hasE2BKey ? "✅ Set" : "⚠️  Not set (required for E2B sandbox)"}`,
  );
  console.log("");
  console.log("Sandbox Configuration:");
  console.log(
    `  Default Sandbox:   ${process.env.BUNNY_AGENT_SANDBOX || "e2b (default)"}`,
  );
  console.log(`  Docker Host:       ${dockerHost}`);
  console.log("");
  console.log("Template Configuration:");
  console.log(
    `  Default Template:  ${process.env.BUNNY_AGENT_TEMPLATE || "default"}`,
  );
  console.log(`  Templates Dir:     ${findTemplatesDir() || "Not found"}`);
  console.log("");

  if (!hasClaudeAuthSet) {
    console.log("⚠️  Warning: Claude auth is required to run agents.");
    console.log(
      "   Set one of: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, LITELLM_MASTER_KEY, or Bedrock proxy env.",
    );
    console.log("   Example: export ANTHROPIC_API_KEY=your_api_key");
    console.log(
      "   Bedrock proxy: ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BEDROCK_BASE_URL + CLAUDE_CODE_USE_BEDROCK=1",
    );
    console.log("");
  }

  if (!hasE2BKey) {
    console.log("ℹ️  Note: E2B_API_KEY is required for the E2B sandbox.");
    console.log("   Get your API key from https://e2b.dev/");
    console.log("   Or use Sandock (Docker) sandbox instead.");
    console.log("");
  }

  console.log("Quick Start:");
  console.log('  bunny-agent-manager run "Create a hello world script"');
  console.log("");
  console.log("Documentation:");
  console.log("  https://github.com/vikadata/bunny-agent");
}

function findTemplatesDir(): string | null {
  const envPath = process.env.BUNNY_AGENT_TEMPLATES_DIR;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  // Standard sandbox location
  const sandboxPath = "/bunny-agent/templates";
  if (fs.existsSync(sandboxPath)) {
    return sandboxPath;
  }

  // Development: relative to current directory
  const devPath = path.resolve(process.cwd(), "templates");
  if (fs.existsSync(devPath)) {
    return devPath;
  }

  // Try parent directories
  let current = process.cwd();
  for (let i = 0; i < 5; i++) {
    const checkPath = path.join(current, "templates");
    if (fs.existsSync(checkPath)) {
      return checkPath;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}
