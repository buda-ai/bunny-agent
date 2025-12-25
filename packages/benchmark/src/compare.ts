/**
 * Benchmark Comparison
 *
 * Compare benchmark results across multiple agent runners
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type {
  AgentRunner,
  BenchmarkReport,
  BenchmarkResult,
  ComparisonResult,
  ComparisonSummary,
  GaiaLevel,
} from "./types.js";

/**
 * Load all benchmark results for a runner from a directory
 */
export function loadRunnerResults(
  outputDir: string,
  runner: AgentRunner,
  dataset: "validation" | "test",
): BenchmarkReport | null {
  const latestPath = join(outputDir, `${runner}-${dataset}-latest.json`);

  if (!existsSync(latestPath)) {
    return null;
  }

  try {
    const content = readFileSync(latestPath, "utf-8");
    return JSON.parse(content) as BenchmarkReport;
  } catch {
    return null;
  }
}

/**
 * Load results from all available runners
 */
export function loadAllRunnerResults(
  outputDir: string,
  dataset: "validation" | "test",
): Map<AgentRunner, BenchmarkReport> {
  const runners: AgentRunner[] = [
    "sandagent",
    "gemini-cli",
    "claudecode",
    "codex-cli",
  ];

  const results = new Map<AgentRunner, BenchmarkReport>();

  for (const runner of runners) {
    const report = loadRunnerResults(outputDir, runner, dataset);
    if (report) {
      results.set(runner, report);
    }
  }

  return results;
}

/**
 * Compare results across runners
 */
export function compareResults(
  reports: Map<AgentRunner, BenchmarkReport>,
): ComparisonResult[] {
  // Collect all unique task IDs
  const allTaskIds = new Set<string>();
  const taskLevels = new Map<string, GaiaLevel>();

  for (const report of reports.values()) {
    for (const result of report.results) {
      allTaskIds.add(result.taskId);
      taskLevels.set(result.taskId, result.level);
    }
  }

  // Build comparison results
  const comparisons: ComparisonResult[] = [];

  for (const taskId of allTaskIds) {
    const comparison: ComparisonResult = {
      taskId,
      level: taskLevels.get(taskId)!,
      runners: {},
    };

    for (const [runner, report] of reports) {
      const result = report.results.find((r) => r.taskId === taskId);
      if (result) {
        comparison.runners[runner] = {
          correct: result.correct,
          durationMs: result.durationMs,
          answer: result.answer,
        };
      }
    }

    comparisons.push(comparison);
  }

  return comparisons;
}

/**
 * Generate comparison summary statistics
 */
export function generateComparisonSummary(
  comparisons: ComparisonResult[],
): ComparisonSummary {
  const runners: AgentRunner[] = [
    "sandagent",
    "gemini-cli",
    "claudecode",
    "codex-cli",
  ];
  const levels: GaiaLevel[] = [1, 2, 3];

  const summary: ComparisonSummary = {
    timestamp: new Date().toISOString(),
    runners: {},
    byLevel: {},
  };

  // Calculate per-runner statistics
  for (const runner of runners) {
    const runnerResults = comparisons.filter(
      (c) => c.runners[runner] !== undefined,
    );

    if (runnerResults.length > 0) {
      const correct = runnerResults.filter(
        (c) => c.runners[runner]?.correct,
      ).length;
      const totalDuration = runnerResults.reduce(
        (sum, c) => sum + (c.runners[runner]?.durationMs ?? 0),
        0,
      );

      summary.runners[runner] = {
        total: runnerResults.length,
        correct,
        accuracy: (correct / runnerResults.length) * 100,
        avgDurationMs: totalDuration / runnerResults.length,
      };
    }
  }

  // Calculate per-level statistics
  for (const level of levels) {
    summary.byLevel[level] = {};

    const levelComparisons = comparisons.filter((c) => c.level === level);

    for (const runner of runners) {
      const runnerLevelResults = levelComparisons.filter(
        (c) => c.runners[runner] !== undefined,
      );

      if (runnerLevelResults.length > 0) {
        const correct = runnerLevelResults.filter(
          (c) => c.runners[runner]?.correct,
        ).length;

        summary.byLevel[level]![runner] = {
          total: runnerLevelResults.length,
          correct,
          accuracy: (correct / runnerLevelResults.length) * 100,
        };
      }
    }
  }

  return summary;
}

/**
 * Display comparison results in a table format
 */
export function displayComparisonTable(summary: ComparisonSummary): void {
  const runners = Object.keys(summary.runners) as AgentRunner[];

  if (runners.length === 0) {
    console.log("No benchmark results found to compare.");
    return;
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 Agent Runner Comparison");
  console.log("=".repeat(80));

  // Overall statistics table
  console.log("\n📈 Overall Performance:");
  console.log("-".repeat(80));
  console.log(
    "Runner".padEnd(15) +
      "Total".padEnd(10) +
      "Correct".padEnd(10) +
      "Accuracy".padEnd(12) +
      "Avg Time",
  );
  console.log("-".repeat(80));

  for (const runner of runners) {
    const stats = summary.runners[runner]!;
    console.log(
      runner.padEnd(15) +
        String(stats.total).padEnd(10) +
        String(stats.correct).padEnd(10) +
        `${stats.accuracy.toFixed(2)}%`.padEnd(12) +
        `${(stats.avgDurationMs / 1000).toFixed(2)}s`,
    );
  }

  // Per-level statistics
  console.log("\n📊 Performance by Level:");
  console.log("-".repeat(80));

  for (const level of [1, 2, 3] as GaiaLevel[]) {
    const levelStats = summary.byLevel[level];
    if (levelStats && Object.keys(levelStats).length > 0) {
      console.log(`\nLevel ${level}:`);
      console.log(
        "  " +
          "Runner".padEnd(15) +
          "Total".padEnd(10) +
          "Correct".padEnd(10) +
          "Accuracy",
      );

      for (const runner of runners) {
        const stats = levelStats[runner];
        if (stats) {
          console.log(
            "  " +
              runner.padEnd(15) +
              String(stats.total).padEnd(10) +
              String(stats.correct).padEnd(10) +
              `${stats.accuracy.toFixed(2)}%`,
          );
        }
      }
    }
  }

  console.log("\n" + "=".repeat(80) + "\n");
}

/**
 * Generate a Markdown comparison report
 */
export function generateMarkdownReport(
  summary: ComparisonSummary,
  comparisons: ComparisonResult[],
): string {
  const runners = Object.keys(summary.runners) as AgentRunner[];
  let md = "";

  md += "# GAIA Benchmark Comparison Report\n\n";
  md += `Generated: ${summary.timestamp}\n\n`;

  // Overall statistics
  md += "## Overall Performance\n\n";
  md += "| Runner | Total | Correct | Accuracy | Avg Time |\n";
  md += "|--------|-------|---------|----------|----------|\n";

  for (const runner of runners) {
    const stats = summary.runners[runner]!;
    md += `| ${runner} | ${stats.total} | ${stats.correct} | ${stats.accuracy.toFixed(2)}% | ${(stats.avgDurationMs / 1000).toFixed(2)}s |\n`;
  }

  // Per-level statistics
  md += "\n## Performance by Level\n\n";

  for (const level of [1, 2, 3] as GaiaLevel[]) {
    const levelStats = summary.byLevel[level];
    if (levelStats && Object.keys(levelStats).length > 0) {
      md += `### Level ${level}\n\n`;
      md += "| Runner | Total | Correct | Accuracy |\n";
      md += "|--------|-------|---------|----------|\n";

      for (const runner of runners) {
        const stats = levelStats[runner];
        if (stats) {
          md += `| ${runner} | ${stats.total} | ${stats.correct} | ${stats.accuracy.toFixed(2)}% |\n`;
        }
      }

      md += "\n";
    }
  }

  // Head-to-head comparisons
  md += "## Head-to-Head Task Comparison\n\n";
  md += "| Task ID | Level |";
  for (const runner of runners) {
    md += ` ${runner} |`;
  }
  md += "\n";

  md += "|---------|-------|";
  for (const _ of runners) {
    md += "----------|";
  }
  md += "\n";

  for (const comparison of comparisons.slice(0, 20)) {
    md += `| ${comparison.taskId.substring(0, 8)}... | ${comparison.level} |`;
    for (const runner of runners) {
      const result = comparison.runners[runner];
      if (result) {
        md += ` ${result.correct ? "✅" : "❌"} |`;
      } else {
        md += " - |";
      }
    }
    md += "\n";
  }

  if (comparisons.length > 20) {
    md += `\n*Showing first 20 of ${comparisons.length} tasks*\n`;
  }

  return md;
}

/**
 * Save comparison report
 */
export function saveComparisonReport(
  summary: ComparisonSummary,
  comparisons: ComparisonResult[],
  outputDir: string,
): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Save JSON
  const jsonPath = join(outputDir, `comparison-${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify({ summary, comparisons }, null, 2));
  console.log(`💾 JSON report saved to: ${jsonPath}`);

  // Save Markdown
  const mdPath = join(outputDir, `comparison-${timestamp}.md`);
  const markdown = generateMarkdownReport(summary, comparisons);
  writeFileSync(mdPath, markdown);
  console.log(`💾 Markdown report saved to: ${mdPath}`);
}
