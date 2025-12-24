/**
 * sandagent info command
 *
 * Show environment and configuration information.
 */

import { parseArgs } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";

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
sandagent info - Show environment and configuration

Usage:
  sandagent info

This command displays your SandAgent configuration and environment status.
`);
    return;
  }

  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasE2BKey = !!process.env.E2B_API_KEY;
  const dockerHost = process.env.DOCKER_HOST || "unix:///var/run/docker.sock";

  console.log("ℹ️  SandAgent Configuration");
  console.log("");
  console.log("Environment:");
  console.log(`  Node.js:           ${process.version}`);
  console.log(`  Platform:          ${process.platform} ${process.arch}`);
  console.log(`  Working Directory: ${process.cwd()}`);
  console.log("");
  console.log("API Keys:");
  console.log(`  ANTHROPIC_API_KEY: ${hasAnthropicKey ? "✅ Set" : "❌ Not set (required)"}`);
  console.log(`  E2B_API_KEY:       ${hasE2BKey ? "✅ Set" : "⚠️  Not set (required for E2B sandbox)"}`);
  console.log("");
  console.log("Sandbox Configuration:");
  console.log(`  Default Sandbox:   ${process.env.SANDAGENT_SANDBOX || "e2b (default)"}`);
  console.log(`  Docker Host:       ${dockerHost}`);
  console.log("");
  console.log("Template Configuration:");
  console.log(`  Default Template:  ${process.env.SANDAGENT_TEMPLATE || "default"}`);
  console.log(`  Templates Dir:     ${findTemplatesDir() || "Not found"}`);
  console.log("");

  if (!hasAnthropicKey) {
    console.log("⚠️  Warning: ANTHROPIC_API_KEY is required to run agents.");
    console.log("   Get your API key from https://console.anthropic.com/");
    console.log("   Set it with: export ANTHROPIC_API_KEY=your_api_key");
    console.log("");
  }

  if (!hasE2BKey) {
    console.log("ℹ️  Note: E2B_API_KEY is required for the E2B sandbox.");
    console.log("   Get your API key from https://e2b.dev/");
    console.log("   Or use Sandock (Docker) sandbox instead.");
    console.log("");
  }

  console.log("Quick Start:");
  console.log('  sandagent run "Create a hello world script"');
  console.log("");
  console.log("Documentation:");
  console.log("  https://github.com/vikadata/sandagent");
}

function findTemplatesDir(): string | null {
  const envPath = process.env.SANDAGENT_TEMPLATES_DIR;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  // Standard sandbox location
  const sandboxPath = "/sandagent/templates";
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
