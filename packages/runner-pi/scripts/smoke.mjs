#!/usr/bin/env node
/**
 * runner-pi smoke test
 *
 * Verifies the moving parts that don't need API keys:
 *   1. Bundled agents/prompts shipped to dist/.
 *   2. Agents loader can parse the bundled markdown.
 *   3. getPiInvocation resolves the installed `pi` CLI.
 *   4. The child process path: spawn `pi --version` and read stdout.
 *
 * Usage:
 *   pnpm --filter @bunny-agent/runner-pi smoke
 *
 * Exit code 0 = all good, non-zero = at least one check failed.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverAgents } from "../dist/extensions/subagent/agents-loader.js";
import { getPiInvocation } from "../dist/extensions/subagent/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = join(__dirname, "..", "dist");
const bundledAgentsDir = join(distRoot, "extensions", "subagent", "agents");
const bundledPromptsDir = join(distRoot, "extensions", "subagent", "prompts");

let failed = 0;
function pass(label) {
  console.log(`  ✓ ${label}`);
}
function fail(label, detail) {
  failed++;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`      ${detail}`);
}

console.log("[1/4] bundled agents/prompts shipped to dist");
const expectedAgents = ["scout.md", "planner.md", "reviewer.md", "worker.md"];
const expectedPrompts = [
  "implement.md",
  "scout-and-plan.md",
  "implement-and-review.md",
];
if (!existsSync(bundledAgentsDir)) {
  fail("dist/extensions/subagent/agents directory exists", bundledAgentsDir);
} else {
  const found = new Set(readdirSync(bundledAgentsDir));
  for (const name of expectedAgents) {
    if (found.has(name)) pass(`agents/${name}`);
    else fail(`agents/${name} missing`);
  }
}
if (!existsSync(bundledPromptsDir)) {
  fail("dist/extensions/subagent/prompts directory exists", bundledPromptsDir);
} else {
  const found = new Set(readdirSync(bundledPromptsDir));
  for (const name of expectedPrompts) {
    if (found.has(name)) pass(`prompts/${name}`);
    else fail(`prompts/${name} missing`);
  }
}

console.log("\n[2/4] agents loader parses bundled markdown");
try {
  const result = discoverAgents({
    cwd: process.cwd(),
    scope: "user",
    bundledDir: bundledAgentsDir,
    userDir: join("/tmp", "bunny-smoke-no-such-user"),
  });
  const names = result.agents.map((a) => a.name).sort();
  const expected = ["planner", "reviewer", "scout", "worker"];
  if (JSON.stringify(names) === JSON.stringify(expected)) {
    pass(`loaded ${names.length} agents: ${names.join(", ")}`);
  } else {
    fail(
      `expected ${expected.join(",")} got ${names.join(",")}`,
    );
  }
  for (const a of result.agents) {
    if (a.source !== "bundled") fail(`${a.name} source != bundled`);
    if (!a.systemPrompt.trim()) fail(`${a.name} has empty system prompt`);
  }
} catch (err) {
  fail("discoverAgents threw", err instanceof Error ? err.message : String(err));
}

console.log("\n[3/4] getPiInvocation resolves the installed pi CLI");
const invocation = getPiInvocation(["--version"]);
if (invocation.command === "pi") {
  fail(
    "getPiInvocation fell back to literal 'pi'",
    "expected resolution to @earendil-works/pi-coding-agent/dist/cli.js",
  );
} else if (
  invocation.args.length < 2 ||
  !invocation.args[0].endsWith("dist/cli.js")
) {
  fail(
    "invocation args missing dist/cli.js",
    JSON.stringify(invocation),
  );
} else {
  pass(`resolved to ${invocation.args[0]}`);
}

console.log("\n[4/4] spawn pi --version and read stdout");
await new Promise((resolve) => {
  let stdout = "";
  let stderr = "";
  const proc = spawn(invocation.command, invocation.args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  proc.on("error", (err) => {
    fail("spawn error", err.message);
    resolve();
  });
  proc.on("close", (code) => {
    if (code !== 0) {
      fail(`pi --version exited with ${code}`, stderr.trim());
    } else if (!stdout.trim() && !stderr.trim()) {
      fail("pi --version produced no output");
    } else {
      const line = (stdout + stderr).split("\n")[0].trim();
      pass(`pi --version: ${line}`);
    }
    resolve();
  });
});

console.log("");
if (failed > 0) {
  console.error(`FAIL: ${failed} smoke check(s) failed.`);
  process.exit(1);
}
console.log("OK: all smoke checks passed.");
