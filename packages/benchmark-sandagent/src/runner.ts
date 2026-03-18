/**
 * Benchmark Runner for SandAgent
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateAnswer,
  getAllSmokingTests,
} from "@sandagent/benchmark-shared";
import { getRunner } from "./runners/index.js";

// Setup logging
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

export interface RunOptions {
  runner: SandAgentRunner;
  verbose?: boolean;
}

interface Summary {
  passed: number;
  failed: number;
  totalTime: number;
}

async function saveResults(
  runner: SandAgentRunner,
  results: BenchmarkResult[],
  summary: Summary,
): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-"); // HH-MM-SS
  const model = process.env.AI_MODEL || "unknown";

  const report = {
    benchmarkType: "sandagent",
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

  // Format: sandagent-{runner}-{model}-{date}-{time}.json
  const modelSlug = model.replace(/:/g, "-").replace(/\//g, "-");
  const filename = `sandagent-${runner}-${modelSlug}-${dateStr}-${timeStr}.json`;

  // Use absolute path from environment or fallback to relative
  const projectRoot = process.env.PROJECT_ROOT || join(process.cwd(), "../..");
  const filepath = join(
    projectRoot,
    "benchmark-results/sandagent/smoking",
    filename,
  );

  writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`💾 Results saved to: ${filepath}\n`);
}

export async function runBenchmark(options: RunOptions): Promise<void> {
  const runner = getRunner(options.runner);
  const tests = getAllSmokingTests();

  console.log(
    `\n🏖️  Running Smoking Benchmark with sandagent --runner ${options.runner}`,
  );
  console.log(`📊 Total tests: ${tests.length}\n`);

  const results: BenchmarkResult[] = [];

  for (const test of tests) {
    const startTime = Date.now();
    log(`\n=== Starting test: ${test.id} - ${test.name} ===`);
    console.log(`🧪 [${test.id}] ${test.name} (${test.category})`);

    try {
      const cmd = runner.buildCommand(test);

      if (options.verbose) {
        console.log(`   Command: ${cmd.command} ${cmd.args.join(" ")}`);
      }

      const output = await runCommand(cmd.command, cmd.args, test.timeoutMs);
      console.log(`[DEBUG] Output length: ${output.length}`);
      console.log(`[DEBUG] Has 0:" lines: ${output.includes('0:"')}`);
      console.log(`[DEBUG] Lines count: ${output.split("\n").length}`);
      const answer = runner.extractAnswer(output);
      console.log(`[DEBUG] Extracted: "${answer.substring(0, 100)}"`);
      log(`Extracted answer: ${answer.substring(0, 200)}`);
      const success = evaluateAnswer(answer, test.expectedOutput);

      if (options.verbose) {
        console.log(`   Raw output length: ${output.length}`);
        console.log(`   Extracted answer: "${answer}"`);
      }

      const result: BenchmarkResult = {
        taskId: test.id,
        success,
        answer,
        expectedAnswer: test.expectedOutput,
        rawOutput: output,
        durationMs: Date.now() - startTime,
      };

      results.push(result);

      if (success) {
        console.log(`   ✅ PASS (${result.durationMs}ms)`);
      } else {
        console.log(`   ❌ FAIL (${result.durationMs}ms)`);
        console.log(`   Expected: ${test.expectedOutput}`);
        console.log(`   Got: ${answer}`);
      }

      if (options.verbose && output) {
        console.log(
          `   Output: ${typeof output === "string" ? output.substring(0, 100) : JSON.stringify(output).substring(0, 100)}...`,
        );
      }
    } catch (error) {
      const result: BenchmarkResult = {
        taskId: test.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
      results.push(result);
      console.log(`   ❌ ERROR: ${result.error}`);
    }

    console.log();
  }

  // Summary
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

  // Save results
  await saveResults(options.runner, results, { passed, failed, totalTime });
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Run in /tmp/sandagent to avoid creating files in project directory
    const workDir = "/tmp/sandagent-benchmark";

    log(`Starting command: ${command} ${args.join(" ")}`);
    log(`Working directory: ${workDir}`);
    log(`Timeout: ${timeoutMs}ms`);

    const proc = spawn(command, args, {
      cwd: workDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      log(`Command timeout after ${timeoutMs}ms, killing process`);
      proc.kill();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout?.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      writeFileSync(logFile, text, { flag: "a" }); // Log stdout
      process.stdout.write(text); // Also show in console
    });

    proc.stderr?.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      writeFileSync(logFile, `[STDERR] ${text}`, { flag: "a" }); // Log stderr
      process.stderr.write(text); // Also show in console
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      log(`Command exited with code ${code}`);
      log(`Output length: ${stdout.length + stderr.length} bytes`);
      if (code === 0) {
        const combined = stdout + stderr;
        resolve(combined);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      log(`Command error: ${error.message}`);
      reject(error);
    });
  });
}
