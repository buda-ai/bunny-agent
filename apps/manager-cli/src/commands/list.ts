/**
 * sandagent list command
 *
 * List running sandboxes.
 */

import { parseArgs } from "node:util";

export async function listCommand(args: string[]): Promise<void> {
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
sandagent list - List running sandboxes

Usage:
  sandagent list

This command shows all currently running sandboxes.
Note: Sandbox state is managed by the sandbox provider (E2B or Docker).
`);
    return;
  }

  console.log("📦 Running Sandboxes");
  console.log("");
  console.log("Note: Sandbox listing is provider-specific.");
  console.log("");
  console.log("For E2B sandboxes:");
  console.log("  Visit https://e2b.dev/dashboard to manage running sandboxes");
  console.log("");
  console.log("For Docker (Sandock) sandboxes:");
  console.log("  Run: docker ps --filter 'label=sandagent'");
  console.log("");
  console.log("Tip: Use 'sandagent stop <session-id>' to stop a specific sandbox.");
}
