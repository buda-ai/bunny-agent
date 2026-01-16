#!/usr/bin/env node

/**
 * SandAgent Benchmark CLI
 *
 * Download GAIA benchmark and run evaluations with multiple agent CLIs.
 *
 * Commands:
 *   download              Download GAIA benchmark dataset
 *   run                   Run benchmark with a specific agent
 *   compare               Compare results across agents
 *
 * Usage:
 *   sandagent-benchmark download [--dataset validation|test]
 *   sandagent-benchmark run --runner sandagent [--level 1|2|3] [--limit N]
 *   sandagent-benchmark compare [--output ./results]
 *
 * Examples:
 *   # Download the validation dataset
 *   sandagent-benchmark download --dataset validation
 *
 *   # Run benchmark with sandagent on Level 1 tasks
 *   sandagent-benchmark run --runner sandagent --level 1 --verbose
 *
 *   # Run with Claude Code on 10 random tasks
 *   sandagent-benchmark run --runner claudecode --limit 10 --random
 *
 *   # Compare all available results
 *   sandagent-benchmark compare
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import {
  compareResults,
  displayComparisonTable,
  generateComparisonSummary,
  loadAllRunnerResults,
  saveComparisonReport,
} from "./compare.js";
import { downloadGaiaDataset, fetchGaiaTasks } from "./downloader.js";
import { runBenchmark } from "./evaluator.js";
import {
  createRunnerConfig,
  ensureCodexLogin,
  getAvailableRunners,
} from "./runner.js";
import type {
  AgentRunner,
  BenchmarkConfig,
  GaiaLevel,
  TaskCategory,
} from "./types.js";

// Load environment variables
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  config({ path: envPath });
  console.log("✅ Loaded environment variables from .env");
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
SandAgent Benchmark CLI

Commands:
  download              Download GAIA benchmark dataset
  run                   Run benchmark with a specific agent
  compare               Compare results across agents

Options:
  --dataset <val>       Dataset to use: validation (default) or test
  --runner <val>        Agent runner: sandagent, gemini-cli, claudecode, codex-cli
  --level <n>           Filter by difficulty level (1, 2, or 3)
  --category <val>      Filter by category: files, code, search, browser, reasoning
  --limit <n>           Limit number of tasks
  --random              Run a random single task
  --task-id <id>        Run a specific task by ID
  --output <dir>        Output directory (default: ./benchmark-results)
  --verbose, -v         Enable verbose output
  --reflect             Enable reflection during task execution
  --resume              Resume from last checkpoint
  --help, -h            Show this help message

Examples:
  # Download the validation dataset
  sandagent-benchmark download --dataset validation

  # Run benchmark with sandagent on Level 1 tasks
  sandagent-benchmark run --runner sandagent --level 1 --verbose

  # Run with multiple runners for comparison
  sandagent-benchmark run --runner sandagent --limit 20
  sandagent-benchmark run --runner claudecode --limit 20
  sandagent-benchmark run --runner gemini-cli --limit 20

  # Compare results
  sandagent-benchmark compare

  # Run specific task
  sandagent-benchmark run --runner sandagent --task-id abc123 --verbose
`);
}

/**
 * Download command handler
 */
async function handleDownload(args: {
  dataset: "validation" | "test";
  output: string;
}): Promise<void> {
  console.log(`\n📥 Downloading GAIA ${args.dataset} dataset...\n`);

  const tasks = await downloadGaiaDataset(args.dataset);

  console.log(`\n✅ Download complete!`);
  console.log(`   Tasks: ${tasks.length}`);
}

/**
 * Run command handler
 */
async function handleRun(args: {
  runner: AgentRunner;
  dataset: "validation" | "test";
  level?: GaiaLevel;
  category?: TaskCategory;
  limit?: number;
  random: boolean;
  taskId?: string;
  output: string;
  verbose: boolean;
  reflect: boolean;
  resume: boolean;
}): Promise<void> {
  // Check if runner is available
  const availableRunners = await getAvailableRunners();
  if (!availableRunners.includes(args.runner)) {
    console.error(
      `❌ Runner "${args.runner}" is not available on this system.`,
    );
    console.error(
      `   Available runners: ${availableRunners.join(", ") || "none"}`,
    );
    console.error(`   Please install the runner CLI and try again.`);
    process.exit(1);
  }

  console.log(`\n🤖 GAIA Benchmark Runner`);
  console.log("=".repeat(60));
  console.log(`Runner:   ${args.runner}`);
  console.log(`Dataset:  ${args.dataset}`);
  console.log(`Level:    ${args.level ?? "all"}`);
  console.log(`Category: ${args.category ?? "all"}`);
  console.log(`Limit:    ${args.limit ?? "none"}`);
  console.log(`Random:   ${args.random ? "yes" : "no"}`);
  console.log(`Task ID:  ${args.taskId ?? "none"}`);
  console.log(`Output:   ${args.output}`);
  console.log(`Verbose:  ${args.verbose}`);
  console.log(`Reflect:  ${args.reflect}`);
  console.log(`Resume:   ${args.resume}`);
  console.log("=".repeat(60));

  // Fetch GAIA tasks
  const tasks = await fetchGaiaTasks(args.dataset);

  // Create runner config
  const runnerConfig = createRunnerConfig(args.runner);

  // Ensure codex-cli is logged in if using that runner
  if (args.runner === "codex-cli") {
    await ensureCodexLogin();
  }

  // Create benchmark config
  const benchmarkConfig: BenchmarkConfig = {
    dataset: args.dataset,
    level: args.level,
    category: args.category,
    limit: args.limit,
    random: args.random,
    taskId: args.taskId,
    outputDir: args.output,
    verbose: args.verbose,
    reflect: args.reflect,
    resume: args.resume,
  };

  // Run benchmark
  await runBenchmark(tasks, runnerConfig, benchmarkConfig);

  console.log("✅ Benchmark complete!");
}

/**
 * Compare command handler
 */
async function handleCompare(args: {
  dataset: "validation" | "test";
  output: string;
}): Promise<void> {
  console.log(`\n📊 Comparing benchmark results...\n`);

  const reports = loadAllRunnerResults(args.output, args.dataset);

  if (reports.size === 0) {
    console.log("❌ No benchmark results found.");
    console.log(
      `   Run benchmarks first with: sandagent-benchmark run --runner <runner>`,
    );
    return;
  }

  console.log(`📂 Found results for: ${Array.from(reports.keys()).join(", ")}`);

  const comparisons = compareResults(reports);
  const summary = generateComparisonSummary(comparisons);

  displayComparisonTable(summary);
  saveComparisonReport(summary, comparisons, args.output);

  console.log("✅ Comparison complete!");
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      dataset: {
        type: "string",
        short: "d",
        default: "validation",
      },
      runner: {
        type: "string",
        short: "r",
      },
      level: {
        type: "string",
        short: "l",
      },
      category: {
        type: "string",
        short: "c",
      },
      limit: {
        type: "string",
        short: "n",
      },
      random: {
        type: "boolean",
        default: false,
      },
      "task-id": {
        type: "string",
        short: "t",
      },
      output: {
        type: "string",
        short: "o",
        default: "./benchmark-results",
      },
      verbose: {
        type: "boolean",
        short: "v",
        default: false,
      },
      reflect: {
        type: "boolean",
        default: false,
      },
      resume: {
        type: "boolean",
        default: false,
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const command = positionals[0];

  switch (command) {
    case "download":
      await handleDownload({
        dataset: values.dataset as "validation" | "test",
        output: values.output as string,
      });
      break;

    case "run":
      if (!values.runner) {
        console.error("❌ Error: --runner is required for run command");
        console.error(
          "   Available runners: sandagent, gemini-cli, claudecode, codex-cli",
        );
        process.exit(1);
      }
      await handleRun({
        runner: values.runner as AgentRunner,
        dataset: values.dataset as "validation" | "test",
        level: values.level
          ? (Number.parseInt(values.level as string, 10) as GaiaLevel)
          : undefined,
        category: values.category as TaskCategory | undefined,
        limit: values.limit
          ? Number.parseInt(values.limit as string, 10)
          : undefined,
        random: values.random as boolean,
        taskId: values["task-id"] as string | undefined,
        output: values.output as string,
        verbose: values.verbose as boolean,
        reflect: values.reflect as boolean,
        resume: values.resume as boolean,
      });
      break;

    case "compare":
      await handleCompare({
        dataset: values.dataset as "validation" | "test",
        output: values.output as string,
      });
      break;

    default:
      if (command) {
        console.error(`❌ Unknown command: ${command}`);
      }
      printHelp();
      process.exit(command ? 1 : 0);
  }
}

// Run if executed directly
main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
