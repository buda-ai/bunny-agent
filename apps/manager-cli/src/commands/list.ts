/**
 * bunny-agent-manager list command
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
bunny-agent-manager list - List running sandboxes

Usage:
  bunny-agent-manager list

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
  console.log("  Run: docker ps --filter 'label=bunny-agent'");
  console.log("");
  console.log(
    "Tip: Use 'bunny-agent-manager stop <session-id>' to stop a specific sandbox.",
  );
}
