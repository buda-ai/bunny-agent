#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionPath = join(__dirname, "extension.js");

const { main } = await import("@mariozechner/pi-coding-agent");
await main(["-e", extensionPath, ...process.argv.slice(2)]);
