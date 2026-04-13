#!/usr/bin/env node

import path from "node:path";

import { createDaemon } from "./server.js";
import { ensureDir } from "./utils.js";

const host = process.env.BUNNY_AGENT_DAEMON_HOST ?? "0.0.0.0";
const port = Number(process.env.BUNNY_AGENT_DAEMON_PORT ?? "3080");
/** Writable default for local dev; Docker sets `BUNNY_AGENT_ROOT` (e.g. `/workspace`). */
const root =
  process.env.BUNNY_AGENT_ROOT ?? path.join(process.cwd(), ".bunny-agent-daemon");

// Safety net: never let the daemon crash on unhandled errors
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (ignored, server continues):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (ignored, server continues):", reason);
});

async function main() {
  await ensureDir(root);
  const server = createDaemon({ host, port, root });
  server.listen(port, host, () => {
    console.log(`bunny-agent-daemon listening on http://${host}:${port}`);
    console.log(`  root: ${root}`);
  });
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
