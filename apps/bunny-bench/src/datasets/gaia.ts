import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "../types.js";

interface GaiaRow {
  task_id: string;
  question: string;
  answer: string;
  level: number;
  has_file: boolean;
  file_name: string;
  steps: string;
  tools: string;
}

function loadGaiaData(): GaiaRow[] {
  // Look for data/gaia.json relative to the project root (process.cwd()) or
  // relative to this compiled file's location (two levels up from dist/).
  const candidates = [
    join(process.cwd(), "data", "gaia.json"),
    join(new URL("../../data/gaia.json", import.meta.url).pathname),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as GaiaRow[];
  }
  throw new Error(
    "GAIA data not found. Run: python scripts/download-gaia.py\n" +
      `Searched: ${candidates.join(", ")}`,
  );
}

/**
 * Build the GAIA task prompt.
 * Instructs the agent to answer with the exact final answer only.
 */
function buildPrompt(row: GaiaRow): string {
  return (
    `${row.question}\n\n` +
    `Answer with ONLY the final answer — no explanation, no units unless they are part of the answer, ` +
    `no punctuation outside the answer itself. ` +
    `If the answer is a number, give the number only (e.g. "17" not "17 thousand hours").`
  );
}

/**
 * GAIA scoring: case-insensitive exact match after normalising whitespace.
 * Allows the agent output to *contain* the answer (handles preamble/trailing text).
 */
function buildExpected(answer: string): RegExp {
  const escaped = answer.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

/** Infer category from GAIA tools metadata. */
function inferCategory(row: GaiaRow): Task["category"] {
  const tools = row.tools.toLowerCase();
  if (tools.includes("browser") || tools.includes("search") || tools.includes("web")) {
    return "tool:web";
  }
  return "reasoning";
}

/** Timeout scales with GAIA level difficulty. */
const LEVEL_TIMEOUT: Record<number, number> = {
  1: 120_000,
  2: 180_000,
  3: 300_000,
};

/**
 * All GAIA validation tasks (all 3 levels, with and without file attachments).
 * Tasks with file attachments are included but flagged — the agent will likely
 * fail them unless the files are manually placed in the working directory.
 *
 * Re-download with:  python scripts/download-gaia.py
 */
export function loadGaiaTasks(opts: { noFile?: boolean; levels?: number[] } = {}): Task[] {
  const rows = loadGaiaData();
  return rows
    .filter((r) => {
      if (opts.noFile && r.has_file) return false;
      if (opts.levels && !opts.levels.includes(r.level)) return false;
      return true;
    })
    .map((r): Task => ({
      id: `gaia-l${r.level}-${r.task_id.slice(0, 8)}`,
      name: `L${r.level} ${r.task_id.slice(0, 8)}`,
      prompt: buildPrompt(r),
      expected: buildExpected(r.answer),
      category: inferCategory(r),
      timeoutMs: LEVEL_TIMEOUT[r.level] ?? 180_000,
    }));
}

/** GAIA Level 1 — easiest, no file attachments. Good smoke test. */
export const GAIA_L1: Task[] = loadGaiaTasks({ noFile: true, levels: [1] });

/** GAIA Level 2 — medium difficulty, no file attachments. */
export const GAIA_L2: Task[] = loadGaiaTasks({ noFile: true, levels: [2] });

/** GAIA Level 3 — hardest, no file attachments. */
export const GAIA_L3: Task[] = loadGaiaTasks({ noFile: true, levels: [3] });

/** All GAIA levels, no file attachments (127 tasks). */
export const GAIA_ALL: Task[] = loadGaiaTasks({ noFile: true });

/** Full GAIA including file-attachment tasks (165 tasks). */
export const GAIA_FULL: Task[] = loadGaiaTasks();
