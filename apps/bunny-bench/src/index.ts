#!/usr/bin/env node
/**
 * bunny-bench — Bunny Agent benchmark CLI
 *
 * Usage:
 *   bunny-bench [--dataset smoking] [--model <model>] [--runner <cmd>] [--cwd <path>] [--id <task-id>]
 */
import chalk from "chalk";
import { DATASETS } from "./datasets.js";
import { runTask } from "./runner.js";
import type { RunSummary, TaskResult } from "./types.js";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function flag(name: string, def = ""): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}
function has(name: string) { return args.includes(name); }

if (has("--help") || has("-h")) {
  console.log(`
bunny-bench — Bunny Agent benchmark

Usage: bunny-bench [options]

Options:
  --dataset <name>   Dataset to run (default: smoking)
                       smoking        — 8 core capability smoke tests
                       gaia-l1        — GAIA Level 1, no-file tasks (42 tasks)
                       gaia-l2        — GAIA Level 2, no-file tasks (66 tasks)
                       gaia-l3        — GAIA Level 3, no-file tasks (19 tasks)
                       gaia-all       — All GAIA levels, no-file (127 tasks)
                       gaia-full      — All GAIA including file-attachment tasks (165 tasks)
                       tblite-easy    — TBLite easy tasks, Docker-based (24 tasks)
                       tblite-medium  — TBLite medium tasks, Docker-based (43 tasks)
                       tblite-all     — All TBLite tasks, Docker-based (100 tasks)
  --model   <name>   Model to pass to bunny (default: bunny's default)
  --runner  <cmd>    Agent command (default: bunny --model openai-compatible/gemini-3.1-pro)
  --cwd     <path>   Working directory for tasks (default: /tmp/bunny-bench)
  --id      <id>     Run a single task by ID
  --help             Show this help

Data download (run once):
  python scripts/download-datasets.py            # download all datasets
  python scripts/download-datasets.py --datasets gaia
  python scripts/download-datasets.py --datasets tblite
Requires: pip install datasets  |  Docker required for tblite-* datasets
`);
  process.exit(0);
}

const datasetName = flag("--dataset", "smoking");
const model = flag("--model") || undefined;
const runner = flag("--runner",
  `node ${new URL("../../bunny-agent-tui/dist/index.js", import.meta.url).pathname} --model openai-compatible/gemini-3.1-pro --print`
);
const taskId = flag("--id") || undefined;

const dataset = DATASETS[datasetName];
if (!dataset) {
  console.error(`Unknown dataset: ${datasetName}. Available: ${Object.keys(DATASETS).join(", ")}`);
  process.exit(1);
}

const tasks = taskId ? dataset.filter((t) => t.id === taskId) : dataset;
if (tasks.length === 0) {
  console.error(`No tasks found${taskId ? ` for id: ${taskId}` : ""}`);
  process.exit(1);
}

// Working dir — use /tmp so file tasks don't pollute the project
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = flag("--cwd") || join(tmpdir(), "bunny-bench");
mkdirSync(cwd, { recursive: true });

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(chalk.bold.cyan("\n🐰 bunny-bench"));
console.log(chalk.dim(`dataset: ${datasetName}  runner: ${runner}${model ? `  model: ${model}` : ""}  cwd: ${cwd}`));
console.log(chalk.dim("─".repeat(60)));

const start = Date.now();
const results: TaskResult[] = [];

for (const task of tasks) {
  process.stdout.write(`  ${chalk.dim(task.id)}  ${task.name.padEnd(30)} `);
  const result = await runTask(task, { runner, model, taskCwd: cwd });
  results.push(result);

  if (result.passed) {
    console.log(chalk.green("✓") + chalk.dim(` ${result.durationMs}ms`));
  } else {
    console.log(chalk.red("✗") + chalk.dim(` ${result.durationMs}ms`));
    if (result.error) {
      console.log(chalk.dim(`    error: ${result.error.slice(0, 120)}`));
    } else {
      const preview = result.output.slice(0, 120).replace(/\n/g, " ");
      console.log(chalk.dim(`    got:   ${preview}`));
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const passed = results.filter((r) => r.passed).length;
const total = results.length;
const passRate = (passed / total) * 100;
const duration = Date.now() - start;

const summary: RunSummary = {
  runner, model, dataset: datasetName,
  total, passed, failed: total - passed,
  passRate, durationMs: duration, results,
};

console.log(chalk.dim("─".repeat(60)));
const color = passRate === 100 ? chalk.green : passRate >= 50 ? chalk.yellow : chalk.red;
console.log(
  `  ${color.bold(`${passed}/${total}`)} passed  ` +
  color(`${passRate.toFixed(0)}%`) +
  chalk.dim(`  ${(duration / 1000).toFixed(1)}s\n`),
);

// Category breakdown
const byCategory = new Map<string, { passed: number; total: number }>();
for (const r of results) {
  const cat = r.task.category;
  const s = byCategory.get(cat) ?? { passed: 0, total: 0 };
  s.total++;
  if (r.passed) s.passed++;
  byCategory.set(cat, s);
}
for (const [cat, s] of byCategory) {
  const c = s.passed === s.total ? chalk.green : chalk.yellow;
  console.log(chalk.dim(`  ${cat.padEnd(15)} ${c(`${s.passed}/${s.total}`)}`));
}
console.log();

// Save results
import { writeFileSync } from "node:fs";
const outDir = join(process.cwd(), "benchmark-results", "bunny");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${datasetName}-${Date.now()}.json`);
writeFileSync(outFile, JSON.stringify(summary, null, 2));
console.log(chalk.dim(`  Results saved: ${outFile}\n`));

process.exit(passed === total ? 0 : 1);
