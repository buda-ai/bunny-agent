#!/usr/bin/env node

/**
 * SandAgent Benchmark CLI
 *
 * Tests sandagent CLI with different --runner options
 */

import { downloadGaiaDataset } from "@sandagent/benchmark-shared";
import { Command } from "commander";
import { compareResults } from "./compare.js";
import { type BenchmarkTransport, runBenchmark } from "./runner.js";
import type { SandAgentRunner } from "./types.js";

const program = new Command();

program
  .name("sandagent-benchmark")
  .description("Benchmark sandagent CLI with different runners")
  .version("0.1.0");

program
  .command("download")
  .description("Download GAIA benchmark dataset")
  .option("--dataset <type>", "Dataset type: validation or test", "validation")
  .action(async (options) => {
    await downloadGaiaDataset(options.dataset);
  });

const TRANSPORTS = new Set<BenchmarkTransport>(["cli", "daemon"]);

program
  .command("run")
  .description(
    "Smoking benchmark: cli (local sandagent) or daemon (Sandock + in-sandbox daemon, like web /api/ai)",
  )
  .requiredOption(
    "--runner <name>",
    "Runner: claude, pi, codex, gemini, opencode",
  )
  .option(
    "--transport <mode>",
    "cli | daemon (Sandock required; in-container daemon URL, default http://127.0.0.1:3080)",
    "cli",
  )
  .option(
    "--daemon-url <url>",
    "In-sandbox daemon base URL (same as SDK DEFAULT_SANDAGENT_DAEMON_URL)",
  )
  .option("--verbose", "Verbose output")
  .action(async (options) => {
    let transport = options.transport as BenchmarkTransport;
    if (options.transport === "sandock") {
      console.warn(
        '[sandagent-benchmark] --transport sandock is deprecated; use "daemon" (Sandock + in-sandbox daemon).',
      );
      transport = "daemon";
    }
    if (!TRANSPORTS.has(transport)) {
      console.error(
        `Invalid --transport "${options.transport}". Use: cli, daemon`,
      );
      process.exit(1);
    }
    await runBenchmark({
      runner: options.runner as SandAgentRunner,
      verbose: options.verbose,
      transport,
      daemonUrl: options.daemonUrl,
    });
  });

program
  .command("compare")
  .description("Compare results across runners")
  .option("--output <dir>", "Output directory", "./benchmark-results")
  .action(async (options) => {
    await compareResults(options.output);
  });

program.parse();
