/**
 * Benchmark Runner for SandAgent
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAllSmokingTests } from "@sandagent/benchmark-shared";
import {
  type BenchmarkTransport,
  executeSmokingBenchmark,
  type SmokingRunOptions,
} from "./run-benchmark-smoking.js";

export type { BenchmarkTransport };
export type RunOptions = SmokingRunOptions;

const projectRoot = process.env.PROJECT_ROOT || join(process.cwd(), "../..");
const logDir = join(projectRoot, ".logs");
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, `benchmark-${Date.now()}.log`);

function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  writeFileSync(logFile, line, { flag: "a" });
  console.log(`[LOG] ${message}`);
}

import type { BenchmarkResult, SandAgentRunner } from "./types.js";

interface Summary {
  passed: number;
  failed: number;
  totalTime: number;
}

async function saveResults(
  runner: SandAgentRunner,
  transport: BenchmarkTransport,
  results: BenchmarkResult[],
  summary: Summary,
): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");
  const model = process.env.AI_MODEL || "unknown";

  const report = {
    benchmarkType: "sandagent",
    transport,
    runner,
    model,
    timestamp: now.toISOString(),
    summary: {
      total: results.length,
      passed: summary.passed,
      failed: summary.failed,
      successRate: (summary.passed / results.length) * 100,
      totalTimeMs: summary.totalTime,
      totalTimeSec: summary.totalTime / 1000,
    },
    results: results.map((r) => ({
      taskId: r.taskId,
      success: r.success,
      durationMs: r.durationMs,
      answer: r.answer,
      error: r.error,
    })),
  };

  const modelSlug = model.replace(/:/g, "-").replace(/\//g, "-");
  const filename = `sandagent-${transport}-${runner}-${modelSlug}-${dateStr}-${timeStr}.json`;

  const root = process.env.PROJECT_ROOT || join(process.cwd(), "../..");
  const filepath = join(root, "benchmark-results/sandagent/smoking", filename);

  writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`💾 Results saved to: ${filepath}\n`);
}

export async function runBenchmark(options: SmokingRunOptions): Promise<void> {
  const tests = getAllSmokingTests();
  const transport: BenchmarkTransport = options.transport ?? "cli";
  const results: BenchmarkResult[] = [];

  await executeSmokingBenchmark(options, {
    log,
    logFile,
    onTransportBanner: (lines) => {
      for (const line of lines) console.log(line);
    },
    onResult: (r) => {
      results.push(r);
    },
  });

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(`\n📈 Summary:`);
  console.log(`   ✅ Passed: ${passed}/${tests.length}`);
  console.log(`   ❌ Failed: ${failed}/${tests.length}`);
  console.log(`   ⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(
    `   📊 Success rate: ${((passed / tests.length) * 100).toFixed(1)}%\n`,
  );

  await saveResults(options.runner, transport, results, {
    passed,
    failed,
    totalTime,
  });
}
