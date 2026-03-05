/**
 * README Matrix Updater
 *
 * Updates the benchmark results matrix in README.md
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunner, BenchmarkConfig, BenchmarkResult } from "./types.js";

const MATRIX_BEGIN = "<!-- SANDAGENT_BENCHMARK_MATRIX_BEGIN -->";
const MATRIX_END = "<!-- SANDAGENT_BENCHMARK_MATRIX_END -->";

/**
 * Check if the benchmark run should update README
 * Only update for full-level runs (no limit, no taskId, no random)
 */
export function shouldUpdateReadme(config: BenchmarkConfig): boolean {
  // Don't update if it's a limited/random/single-task run
  if (config.limit || config.random || config.taskId) {
    return false;
  }

  // Update if it's a full level run (with or without level filter)
  return true;
}

/**
 * Runner column index mapping
 */
const RUNNER_COLUMNS: Record<AgentRunner, number> = {
  sandagent: 1,
  claudecode: 2,
  "gemini-cli": 3,
  "codex-cli": 4,
  opencode: 5,
  pi: 6,
};

/**
 * Row index mapping for dataset:level combinations (0-based, after header rows)
 */
function getRowIndex(dataset: string, level: number): number {
  const rows: Record<string, number> = {
    "validation:1": 0,
    "validation:2": 1,
    "validation:3": 2,
    "test:1": 3,
    "test:2": 4,
    "test:3": 5,
  };
  return rows[`${dataset}:${level}`] ?? -1;
}

/**
 * Update only a specific cell in the README matrix
 */
export function updateReadmeMatrix(
  config: BenchmarkConfig,
  runner: AgentRunner,
  results: BenchmarkResult[],
): void {
  const readmePath = join(process.cwd(), "README.md");

  if (!existsSync(readmePath)) {
    console.warn("⚠️  README.md not found, skipping matrix update");
    return;
  }

  // Must have level to update matrix (category-based runs not in matrix)
  if (!config.level) {
    console.log("ℹ️  No level specified, skipping README update");
    return;
  }

  try {
    // Calculate statistics from results
    const levelResults = results.filter((r) => r.level === config.level);
    const correct = levelResults.filter((r) => r.correct).length;
    const total = levelResults.length;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;

    // Generate cell content
    const jsonFile = `${config.dataset}-l${config.level}-${runner}.json`;
    const cellContent = `[${correct}/${total}（${accuracy.toFixed(2)}%）](./benchmark-results/${jsonFile})`;

    // Read README
    const readme = readFileSync(readmePath, "utf-8");

    // Find matrix section
    const beginIndex = readme.indexOf(MATRIX_BEGIN);
    const endIndex = readme.indexOf(MATRIX_END);

    if (beginIndex === -1 || endIndex === -1) {
      console.warn(
        "⚠️  README.md matrix markers not found, skipping matrix update",
      );
      return;
    }

    // Extract and parse table
    const matrixContent = readme.substring(
      beginIndex + MATRIX_BEGIN.length,
      endIndex,
    );
    const lines = matrixContent.trim().split("\n");

    // Find the row to update (skip header and separator)
    const rowIndex = getRowIndex(config.dataset, config.level);
    if (rowIndex === -1) {
      console.warn(`⚠️  Unknown config: ${config.dataset}:L${config.level}`);
      return;
    }

    const tableRowIndex = rowIndex + 2; // +2 for header and separator
    if (tableRowIndex >= lines.length) {
      console.warn("⚠️  Table row not found");
      return;
    }

    // Parse and update the specific cell
    const row = lines[tableRowIndex];
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

    // Update the runner column
    const colIndex = RUNNER_COLUMNS[runner];
    if (colIndex !== undefined && colIndex < cells.length) {
      cells[colIndex] = cellContent;
    }

    // Reconstruct the row
    lines[tableRowIndex] = `| ${cells.join(" | ")} |`;

    // Reconstruct README
    const before = readme.substring(0, beginIndex + MATRIX_BEGIN.length);
    const after = readme.substring(endIndex);
    const newReadme = `${before}\n${lines.join("\n")}\n${after}`;

    // Write back
    writeFileSync(readmePath, newReadme, "utf-8");

    console.log(
      `✅ README.md cell updated: ${config.dataset}:L${config.level} - ${runner}`,
    );
  } catch (error) {
    console.error("❌ Failed to update README matrix:", error);
  }
}
