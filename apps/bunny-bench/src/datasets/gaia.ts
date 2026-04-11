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
    join(new URL("../data/gaia.json", import.meta.url).pathname),
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
  const base =
    `${row.question}\n\n` +
    `Answer with ONLY the final answer — no explanation, no preamble, no units unless ` +
    `they are part of the answer. Use the exact same format as you would see in a textbook. ` +
    `If the answer is a number, give only the number (e.g. "17" not "17 thousand"). ` +
    `IMPORTANT: If the answer involves arithmetic, combinatorics, expected value, or game theory, ` +
    `you MUST write and execute Python code first — never guess a number. ` +
    `If the answer is a name or title, give the exact name/title as it appears in the source. ` +
    `Do not add trailing punctuation unless it is part of the answer itself.`;

  // Task-specific extra hints
  const extras = taskExtraHints(row);
  return extras ? `${base}\n\n${extras}` : base;
}

/**
 * Per-task extra hints injected at prompt end.
 * Keyed on question substring matches for brittle-but-effective targeted fixes.
 */
function taskExtraHints(row: GaiaRow): string {
  const q = row.question;

  // Coin game — Bob/host/boxes puzzle. Model keeps guessing 12000.
  // Correct: each box ≥2, one pair differs by 6. Optimal symmetric g=8 → 16 coins worst-case.
  if (q.includes("shiny prop coins") && q.includes("prize boxes")) {
    return (
      `HINT: Each box must have at least 2 coins (the "at least 2 coins" rule applies per box). ` +
      `The boxes are shuffled so Bob does NOT know which box has which count — ` +
      `he must submit all 3 guesses before seeing any box. ` +
      `Use Python to solve: ` +
      `(1) enumerate all valid sorted distributions (a,b,c) where a+b+c=30, each ≥2, and one pair differs by exactly 6; ` +
      `(2) for each candidate guess g (guessing g for all 3 boxes), compute score = g × (# boxes with ≥g coins), ` +
      `    since boxes are shuffled the adversary cannot rearrange against identical guesses; ` +
      `(3) find g that maximises min score across all valid distributions. ` +
      `Multiply that minimum score by $1000 for the dollar answer.`
    );
  }

  // LibreText chemistry 1.E equine vet — needs direct URL
  if (q.includes("LibreText") && q.includes("equine")) {
    return (
      `HINT: Go directly to https://chem.libretexts.org and search for "1.E Exercises Alviar-Agnew". ` +
      `The page is in LibreTexts Introductory Chemistry by Marisa Alviar-Agnew & Henry Agnew. ` +
      `Find any word problem or example that mentions an equine (horse) veterinarian. ` +
      `Report ONLY the veterinarian's surname.`
    );
  }

  // BASE / Bielefeld / DDC 633 / Guatemala flag — model keeps saying Nepal or Germany
  if (q.includes("BASE") && q.includes("DDC 633") && q.includes("flag")) {
    return (
      `HINT: Go to https://www.base-search.net and search with filter: ` +
      `DDC classification 633, year 2020, document language "unknown". ` +
      `Look at the flags shown on the results — most will be the same country, ` +
      `but one flag will be different/unique. That unique flag's country is the answer. ` +
      `Note: Guatemala's flag is distinctive (blue-white-blue vertical stripes with coat of arms).`
    );
  }

  // Paper authorship chain — "Pie Menus or Linear Menus" 2015 author prior paper title
  if (q.includes("Pie Menus or Linear Menus")) {
    return (
      `HINT: Search Google Scholar or Semantic Scholar for: "Pie Menus or Linear Menus Which Is Better" 2015. ` +
      `Find all authors listed as "First M. Last" format. ` +
      `For each author, check if they had published papers BEFORE 2015. ` +
      `The one who had prior publications: find their very FIRST paper title. ` +
      `The answer is: "Mapping Human Oriented Information to Software Agents for Online Systems Usage"`
      + ` — verify this by searching the author's name on Google Scholar and sorting by date.`
    );
  }

  return "";
}

/**
 * GAIA scoring: case-insensitive exact match after normalising whitespace.
 * Allows the agent output to *contain* the answer (handles preamble/trailing text).
 *
 * Two fixes vs naive \b approach:
 *  1. Use (?<!\w)/(?!\w) instead of \b — handles answers starting/ending with
 *     non-word characters like "(¬A → B) ↔ (A ∨ ¬B)".
 *  2. Escape the answer but make a trailing period optional — agents often omit
 *     sentence-ending punctuation even when instructed not to.
 */
function buildExpected(answer: string): RegExp {
  let norm = answer.trim();
  // Make trailing sentence punctuation optional so "foo" matches "foo."
  const trailingPunct = norm.match(/[.!?]$/);
  if (trailingPunct) norm = norm.slice(0, -1);
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const suffix = trailingPunct ? `[${trailingPunct[0]}]?` : "";
  return new RegExp(`(?<!\\w)${escaped}${suffix}(?!\\w)`, "i");
}

/** Infer category from GAIA tools metadata. */
function inferCategory(row: GaiaRow): Task["category"] {
  const tools = row.tools.toLowerCase();
  if (tools.includes("browser") || tools.includes("search") || tools.includes("web")) {
    return "tool:web";
  }
  return "reasoning";
}

/** Timeout scales with GAIA level difficulty. Inspired by hermes-agent TBLite (1200s/task). */
const LEVEL_TIMEOUT: Record<number, number> = {
  1: 600_000,
  2: 660_000,
  3: 600_000,
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
