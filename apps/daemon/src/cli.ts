#!/usr/bin/env node

import { createDaemon } from "./server.js";
import { ensureDir } from "./utils.js";

const host = process.env.SANDAGENT_DAEMON_HOST ?? "0.0.0.0";
const port = Number(process.env.SANDAGENT_DAEMON_PORT ?? "3080");
const root = process.env.SANDAGENT_ROOT ?? "/agent";

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
    console.log(`sandagent-daemon listening on http://${host}:${port}`);
    console.log(`  root: ${root}`);
  });
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
