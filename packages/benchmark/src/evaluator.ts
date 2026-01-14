/**
 * Benchmark Evaluator
 *
 * Runs benchmarks and evaluates agent performance
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shouldUpdateReadme, updateReadmeMatrix } from "./readme-updater.js";
import { runTask, runTaskWithReflection } from "./runner.js";
import type {
  AgentRunner,
  BenchmarkConfig,
  BenchmarkMetadata,
  BenchmarkReport,
  BenchmarkResult,
  GaiaTask,
  RunnerConfig,
  TaskCategory,
} from "./types.js";

/**
 * Categorize a task based on its content and files
 */
export function categorizeTask(task: GaiaTask): TaskCategory[] {
  const categories: TaskCategory[] = [];
  const questionLower = task.question.toLowerCase();

  // Files: Has attachments
  if (task.files && task.files.length > 0) {
    categories.push("files");
  }

  // Code/Math: Contains code, calculation, or math keywords
  if (
    questionLower.includes("calculate") ||
    questionLower.includes("compute") ||
    questionLower.includes("code") ||
    questionLower.includes("program") ||
    questionLower.includes("equation") ||
    questionLower.includes("formula") ||
    questionLower.includes("algorithm") ||
    /\d+\s*[+\-*/]\s*\d+/.test(questionLower)
  ) {
    categories.push("code");
  }

  // Search: Contains search, find, article, web keywords
  if (
    questionLower.includes("search") ||
    questionLower.includes("find") ||
    questionLower.includes("article") ||
    questionLower.includes("website") ||
    questionLower.includes("url") ||
    questionLower.includes("arxiv") ||
    questionLower.includes("wikipedia") ||
    questionLower.includes("published") ||
    questionLower.includes("journal")
  ) {
    categories.push("search");
  }

  // Browser: Contains browser, navigate, click keywords
  if (
    questionLower.includes("browser") ||
    questionLower.includes("navigate") ||
    questionLower.includes("click") ||
    questionLower.includes("screenshot") ||
    questionLower.includes("webpage") ||
    questionLower.includes("web page")
  ) {
    categories.push("browser");
  }

  // Reasoning: Pure logic/reasoning tasks (no other category)
  if (categories.length === 0) {
    categories.push("reasoning");
  }

  return categories;
}

/**
 * Filter tasks based on benchmark configuration
 */
export function filterTasks(
  tasks: GaiaTask[],
  config: BenchmarkConfig,
): GaiaTask[] {
  let filtered = [...tasks];

  // Filter by specific task ID
  if (config.taskId) {
    filtered = filtered.filter((t) => t.id === config.taskId);
    if (filtered.length === 0) {
      throw new Error(`Task with ID "${config.taskId}" not found`);
    }
    console.log(`🎯 Found task: ${config.taskId}`);
    return filtered;
  }

  // Filter by level
  if (config.level) {
    filtered = filtered.filter((t) => t.level === config.level);
    console.log(
      `🔍 Filtered to ${filtered.length} tasks (Level ${config.level})`,
    );
  }

  // Filter by category
  if (config.category) {
    filtered = filtered.filter((t) => {
      const categories = categorizeTask(t);
      return categories.includes(config.category!);
    });
    console.log(
      `🔍 Filtered to ${filtered.length} tasks (Category: ${config.category})`,
    );
  }

  // Random selection
  if (config.random) {
    const randomIndex = Math.floor(Math.random() * filtered.length);
    const selected = filtered[randomIndex];
    console.log(
      `🎲 Randomly selected: ${selected.id} (Level ${selected.level})`,
    );
    return [selected];
  }

  // Limit number of tasks
  if (config.limit && config.limit < filtered.length) {
    filtered = filtered.slice(0, config.limit);
    console.log(`🔍 Limited to ${config.limit} tasks`);
  }

  return filtered;
}

/**
 * Load checkpoint if resuming
 */
export function loadCheckpoint(
  outputDir: string,
  runner: AgentRunner,
  dataset: string,
): { results: BenchmarkResult[]; completedIds: Set<string> } | null {
  const checkpointPath = join(outputDir, `${runner}-${dataset}-latest.json`);

  if (!existsSync(checkpointPath)) {
    return null;
  }

  try {
    const content = readFileSync(checkpointPath, "utf-8");
    const report = JSON.parse(content) as BenchmarkReport;

    if (!report.results || !Array.isArray(report.results)) {
      return null;
    }

    const completedIds = new Set(report.results.map((r) => r.taskId));
    console.log(
      `📂 Loaded checkpoint with ${report.results.length} completed tasks`,
    );

    return {
      results: report.results,
      completedIds,
    };
  } catch (error) {
    console.warn(`⚠️  Failed to load checkpoint: ${error}`);
    return null;
  }
}

/**
 * Save benchmark results
 */
export function saveResults(
  results: BenchmarkResult[],
  runner: AgentRunner,
  config: BenchmarkConfig,
  incremental = false,
): void {
  // Ensure output directory exists
  if (!existsSync(config.outputDir)) {
    mkdirSync(config.outputDir, { recursive: true });
  }

  // Calculate statistics
  const correct = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? (correct / results.length) * 100 : 0;

  const metadata: BenchmarkMetadata = {
    dataset: config.dataset,
    timestamp: new Date().toISOString(),
    total: results.length,
    correct,
    accuracy,
    runner,
    incremental,
  };

  const report: BenchmarkReport = {
    metadata,
    results,
  };

  // Save latest results
  const latestPath = join(
    config.outputDir,
    `${runner}-${config.dataset}-latest.json`,
  );
  writeFileSync(latestPath, JSON.stringify(report, null, 2));

  // Save timestamped results (non-incremental only)
  if (!incremental) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const timestampedPath = join(
      config.outputDir,
      `${runner}-${config.dataset}-${timestamp}.json`,
    );
    writeFileSync(timestampedPath, JSON.stringify(report, null, 2));
    console.log(`💾 Results saved to: ${timestampedPath}`);
  }
}

/**
 * Display benchmark summary
 */
export function displaySummary(
  results: BenchmarkResult[],
  runner: AgentRunner,
): void {
  const correct = results.filter((r) => r.correct).length;
  const total = results.length;
  const accuracy = total > 0 ? (correct / total) * 100 : 0;

  // Per-level statistics
  const byLevel = {
    1: results.filter((r) => r.level === 1),
    2: results.filter((r) => r.level === 2),
    3: results.filter((r) => r.level === 3),
  };

  const avgDuration =
    results.length > 0
      ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
      : 0;

  console.log("\n" + "=".repeat(60));
  console.log(`📊 Benchmark Results: ${runner}`);
  console.log("=".repeat(60));
  console.log(`Total Tasks:    ${total}`);
  console.log(`Correct:        ${correct}`);
  console.log(`Accuracy:       ${accuracy.toFixed(2)}%`);
  console.log(`Avg Duration:   ${(avgDuration / 1000).toFixed(2)}s`);
  console.log("-".repeat(60));
  console.log("By Level:");

  for (const [level, levelResults] of Object.entries(byLevel)) {
    if (levelResults.length > 0) {
      const levelCorrect = levelResults.filter((r) => r.correct).length;
      const levelAccuracy = (levelCorrect / levelResults.length) * 100;
      console.log(
        `  Level ${level}: ${levelCorrect}/${levelResults.length} (${levelAccuracy.toFixed(2)}%)`,
      );
    }
  }

  console.log("=".repeat(60) + "\n");
}

/**
 * Run benchmark with a specific runner
 */
export async function runBenchmark(
  tasks: GaiaTask[],
  runnerConfig: RunnerConfig,
  config: BenchmarkConfig,
): Promise<BenchmarkResult[]> {
  const runner = runnerConfig.runner;

  // Filter tasks
  let filteredTasks = filterTasks(tasks, config);

  // Load checkpoint if resuming
  let results: BenchmarkResult[] = [];
  if (config.resume) {
    const checkpoint = loadCheckpoint(config.outputDir, runner, config.dataset);
    if (checkpoint) {
      results = checkpoint.results;
      filteredTasks = filteredTasks.filter(
        (t) => !checkpoint.completedIds.has(t.id),
      );
      console.log(`🔄 Resuming: ${filteredTasks.length} tasks remaining`);
    }
  }

  if (filteredTasks.length === 0) {
    console.log("✅ No tasks to run");
    return results;
  }

  console.log(`\n🚀 Running ${filteredTasks.length} tasks with ${runner}...\n`);

  // Show reflection mode status
  if (config.reflect) {
    console.log("💭 Reflection mode: ENABLED (prompt-based)\n");
  }

  // Run tasks sequentially
  for (const [index, task] of filteredTasks.entries()) {
    const progress = `[${index + 1 + results.length}/${results.length + filteredTasks.length}]`;
    console.log(`${progress} Evaluating ${task.id} (Level ${task.level})...`);

    if (config.verbose) {
      console.log(`   Question: ${task.question.substring(0, 80)}...`);
    }

    const result = config.reflect
      ? await runTaskWithReflection(task, runnerConfig, {
          verbose: config.verbose,
        })
      : await runTask(task, runnerConfig);
    results.push(result);

    if (config.verbose) {
      console.log(`   Answer: ${result.answer.substring(0, 80)}...`);
      console.log(
        `   Result: ${result.correct ? "✅ CORRECT" : "❌ INCORRECT"} (${(result.durationMs / 1000).toFixed(2)}s)`,
      );
    } else {
      console.log(
        `   ${result.correct ? "✅" : "❌"} ${(result.durationMs / 1000).toFixed(2)}s`,
      );
    }

    // Save incremental results
    saveResults(results, runner, config, true);

    // Small delay to avoid rate limits
    if (index < filteredTasks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Save final results
  saveResults(results, runner, config, false);

  // Display summary
  displaySummary(results, runner);

  return results;
}
