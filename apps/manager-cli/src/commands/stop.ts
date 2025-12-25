/**
 * sandagent stop command
 *
 * Stop a sandbox by ID.
 */

import { parseArgs } from "node:util";

export async function stopCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
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
sandagent stop - Stop a sandbox by ID

Usage:
  sandagent stop <session-id>

Examples:
  sandagent stop session-123
  sandagent stop my-project-sandbox
`);
    return;
  }

  const sessionId = positionals[0];

  if (!sessionId) {
    console.error("❌ Error: Session ID is required");
    console.error("Usage: sandagent stop <session-id>");
    process.exit(1);
  }

  console.log(`🛑 Stopping sandbox: ${sessionId}`);
  console.log("");
  console.log("Note: Sandbox stopping is provider-specific.");
  console.log("");
  console.log("For E2B sandboxes:");
  console.log(
    "  The sandbox will automatically terminate when the session ends.",
  );
  console.log(
    "  Visit https://e2b.dev/dashboard to force-stop running sandboxes.",
  );
  console.log("");
  console.log("For Docker (Sandock) sandboxes:");
  console.log(`  Run: docker stop sandagent-${sessionId}`);
  console.log("");
  console.log("Tip: Sandboxes are automatically cleaned up after inactivity.");
}
