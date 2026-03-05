#!/usr/bin/env node

/**
 * SandAgent Benchmark CLI
 *
 * Tests sandagent CLI with different --runner options
 */

import { downloadGaiaDataset } from "@sandagent/benchmark-shared";
import { Command } from "commander";
import { compareResults } from "./compare.js";
import { runBenchmark } from "./runner.js";
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

program
  .command("run")
  .description("Run smoking benchmark with sandagent --runner <name>")
  .requiredOption("--runner <name>", "Runner: claude, pi, codex, gemini")
  .option("--verbose", "Verbose output")
  .action(async (options) => {
    await runBenchmark({
      runner: options.runner as SandAgentRunner,
      verbose: options.verbose,
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
