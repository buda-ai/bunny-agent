/**
 * Ledger — persistent per-task pass/fail history across benchmark runs.
 *
 * Stored at: benchmark-results/bunny/{dataset}-ledger.json
 *
 * Use `--only-failed` to skip tasks with at least one past correct answer,
 * letting you iterate only on unsolved tasks.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskResult } from "./types.js";

export interface LedgerEntry {
  /** Number of times this task was answered correctly */
  passCount: number;
  /** Number of times this task was answered incorrectly */
  failCount: number;
  /** Whether the most recent attempt was correct */
  lastPassed: boolean;
  /** ISO timestamp of last run */
  lastRunAt: string;
}

export type Ledger = Record<string, LedgerEntry>;

function ledgerPath(outDir: string, dataset: string): string {
  return join(outDir, `${dataset}-ledger.json`);
}

/** Load existing ledger (or return empty one if none exists). */
export function loadLedger(outDir: string, dataset: string): Ledger {
  const p = ledgerPath(outDir, dataset);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Ledger;
  } catch {
    return {};
  }
}

/** Merge new run results into existing ledger and persist. */
export function updateLedger(
  outDir: string,
  dataset: string,
  results: TaskResult[],
): Ledger {
  const ledger = loadLedger(outDir, dataset);
  const now = new Date().toISOString();

  for (const r of results) {
    const prev = ledger[r.task.id] ?? { passCount: 0, failCount: 0, lastPassed: false, lastRunAt: now };
    ledger[r.task.id] = {
      passCount: prev.passCount + (r.passed ? 1 : 0),
      failCount: prev.failCount + (r.passed ? 0 : 1),
      lastPassed: r.passed,
      lastRunAt: now,
    };
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(ledgerPath(outDir, dataset), JSON.stringify(ledger, null, 2));
  return ledger;
}

/**
 * Filter task IDs to only those that have never been answered correctly.
 * Tasks not yet in the ledger are included (never attempted = still "failed").
 */
export function failedTaskIds(ledger: Ledger): Set<string> | null {
  const ids = Object.entries(ledger)
    .filter(([, e]) => e.passCount === 0)
    .map(([id]) => id);
  // If ledger is empty we return null meaning "no filter"
  if (Object.keys(ledger).length === 0) return null;
  return new Set(ids);
}
