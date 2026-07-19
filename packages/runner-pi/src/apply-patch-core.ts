/**
 * V4A patch engine ("apply_patch" format) — pure Node, no pi dependencies.
 *
 * Parses and applies OpenAI's context-addressed diff format, delimited by
 * `*** Begin Patch` / `*** Update File: ...` / `*** End Patch`. Hunks are
 * located by their surrounding context lines rather than line numbers, with
 * a tolerant (exact -> rstrip -> full trim) fallback for the minor
 * whitespace drift models sometimes introduce in generated context.
 *
 * Consumed by two front-ends:
 * - `apply-patch-tool.ts`: the native `apply_patch` ToolDefinition exposed
 *   to OpenAI-provider models through the pi tool registry.
 * - `apply-patch-bin.ts`: a standalone CLI so `apply_patch <<'PATCH'` works
 *   as a real shell command — GPT-5.x also emits it chained inside bash
 *   commands (`cd x && apply_patch <<'PATCH'`), which no tool registration
 *   can intercept.
 *
 * This module must stay importable as a self-contained pair with
 * `apply-patch-bin.ts` (node builtins only) so the bin can be bundled or
 * executed straight from `dist/` without the rest of the runner.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const BEGIN_PATCH = "*** Begin Patch";
const END_PATCH = "*** End Patch";
const UPDATE_FILE = "*** Update File: ";
const ADD_FILE = "*** Add File: ";
const DELETE_FILE = "*** Delete File: ";
const MOVE_TO = "*** Move to: ";
const HUNK_MARKER = "@@";
const EOF_MARKER = "*** End of File";

interface Hunk {
  /** Lines to match against current file content (context + removed), in order. */
  before: string[];
  /** Lines the matched range is replaced with (context + added), in order. */
  after: string[];
}

interface FileOp {
  kind: "update" | "add" | "delete";
  path: string;
  moveTo?: string;
  hunks: Hunk[];
  /** For "add": full new file content, one entry per `+` line. */
  addLines: string[];
}

export class PatchParseError extends Error {}

function isSectionMarker(line: string): boolean {
  return (
    line.startsWith(UPDATE_FILE) ||
    line.startsWith(ADD_FILE) ||
    line.startsWith(DELETE_FILE) ||
    line.trim() === END_PATCH
  );
}

function parseUpdateHunks(
  lines: string[],
  start: number,
): { hunks: Hunk[]; next: number } {
  const hunks: Hunk[] = [];
  let i = start;
  let current: Hunk | null = null;

  const flush = () => {
    if (current && (current.before.length > 0 || current.after.length > 0)) {
      hunks.push(current);
    }
    current = null;
  };

  while (i < lines.length && !isSectionMarker(lines[i])) {
    const line = lines[i];
    if (line.startsWith(HUNK_MARKER)) {
      flush();
      current = { before: [], after: [] };
      i++;
      continue;
    }
    if (line.trim() === EOF_MARKER) {
      i++;
      continue;
    }
    if (current === null) current = { before: [], after: [] };

    if (line.startsWith("+")) {
      current.after.push(line.slice(1));
    } else if (line.startsWith("-")) {
      current.before.push(line.slice(1));
    } else if (line.startsWith(" ")) {
      const content = line.slice(1);
      current.before.push(content);
      current.after.push(content);
    } else if (line.trim() === "") {
      current.before.push("");
      current.after.push("");
    } else {
      throw new PatchParseError(`Malformed hunk line: ${line}`);
    }
    i++;
  }
  flush();
  return { hunks, next: i };
}

function parsePatch(patchText: string): FileOp[] {
  const lines = patchText.split("\n");
  let i = 0;

  // Tolerate leading blank lines and a missing Begin Patch wrapper — models
  // occasionally omit the envelope despite the prompt guidelines.
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && lines[i].trim() === BEGIN_PATCH) i++;

  const ops: FileOp[] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === END_PATCH || line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith(UPDATE_FILE)) {
      const path = line.slice(UPDATE_FILE.length).trim();
      i++;
      let moveTo: string | undefined;
      if (lines[i]?.startsWith(MOVE_TO)) {
        moveTo = lines[i].slice(MOVE_TO.length).trim();
        i++;
      }
      const { hunks, next } = parseUpdateHunks(lines, i);
      ops.push({ kind: "update", path, moveTo, hunks, addLines: [] });
      i = next;
      continue;
    }

    if (line.startsWith(ADD_FILE)) {
      const path = line.slice(ADD_FILE.length).trim();
      i++;
      const addLines: string[] = [];
      while (i < lines.length && !isSectionMarker(lines[i])) {
        if (lines[i].startsWith("+")) addLines.push(lines[i].slice(1));
        else if (lines[i].trim() !== "") {
          throw new PatchParseError(
            `Add File "${path}": expected "+"-prefixed content, got: ${lines[i]}`,
          );
        }
        i++;
      }
      ops.push({ kind: "add", path, hunks: [], addLines });
      continue;
    }

    if (line.startsWith(DELETE_FILE)) {
      const path = line.slice(DELETE_FILE.length).trim();
      i++;
      ops.push({ kind: "delete", path, hunks: [], addLines: [] });
      continue;
    }

    throw new PatchParseError(`Unexpected line in patch: ${line}`);
  }

  if (ops.length === 0) {
    throw new PatchParseError(
      "Patch contains no file operations (Update File / Add File / Delete File).",
    );
  }

  return ops;
}

/**
 * Locate `needle` as a contiguous run inside `haystack`, starting at `from`.
 * Tries an exact match first, then progressively looser whitespace
 * comparisons — mirrors OpenAI's reference apply_patch fallback, since
 * model-generated context lines occasionally drift on indentation.
 */
function findHunkStart(
  haystack: string[],
  needle: string[],
  from: number,
): number {
  if (needle.length === 0) return from;

  const canonicalizers: Array<(s: string) => string> = [
    (s) => s,
    (s) => s.replace(/\s+$/, ""),
    (s) => s.trim(),
  ];

  for (const canon of canonicalizers) {
    const canonNeedle = needle.map(canon);
    for (let start = from; start <= haystack.length - needle.length; start++) {
      let matched = true;
      for (let j = 0; j < needle.length; j++) {
        if (canon(haystack[start + j]) !== canonNeedle[j]) {
          matched = false;
          break;
        }
      }
      if (matched) return start;
    }
  }
  return -1;
}

function applyHunks(originalContent: string, hunks: Hunk[]): string {
  const trailingNewline = originalContent.endsWith("\n");
  const lines = originalContent.length === 0 ? [] : originalContent.split("\n");
  if (trailingNewline) lines.pop();

  let cursor = 0;
  const resultLines: string[] = [];

  for (const hunk of hunks) {
    const start = findHunkStart(lines, hunk.before, cursor);
    if (start === -1) {
      throw new PatchParseError(
        `Could not locate context for hunk:\n${hunk.before.join("\n")}`,
      );
    }
    resultLines.push(...lines.slice(cursor, start));
    resultLines.push(...hunk.after);
    cursor = start + hunk.before.length;
  }
  resultLines.push(...lines.slice(cursor));

  return resultLines.join("\n") + (trailingNewline ? "\n" : "");
}

export interface ApplyPatchResult {
  changedFiles: string[];
  addedFiles: string[];
  deletedFiles: string[];
}

/** Apply a parsed patch to disk, relative to `cwd`. */
export function applyPatch(cwd: string, patchText: string): ApplyPatchResult {
  const ops = parsePatch(patchText);
  const changedFiles: string[] = [];
  const addedFiles: string[] = [];
  const deletedFiles: string[] = [];

  for (const op of ops) {
    const target = resolve(cwd, op.path);

    if (op.kind === "add") {
      if (existsSync(target)) {
        throw new PatchParseError(
          `Add File "${op.path}": file already exists.`,
        );
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${op.addLines.join("\n")}\n`);
      addedFiles.push(op.path);
      continue;
    }

    if (op.kind === "delete") {
      if (!existsSync(target)) {
        throw new PatchParseError(`Delete File "${op.path}": file not found.`);
      }
      unlinkSync(target);
      deletedFiles.push(op.path);
      continue;
    }

    // update
    if (!existsSync(target)) {
      throw new PatchParseError(`Update File "${op.path}": file not found.`);
    }
    const original = readFileSync(target, "utf8");
    const updated = applyHunks(original, op.hunks);
    if (op.moveTo) {
      const destination = resolve(cwd, op.moveTo);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, updated);
      unlinkSync(target);
    } else {
      writeFileSync(target, updated);
    }
    changedFiles.push(op.moveTo ?? op.path);
  }

  return { changedFiles, addedFiles, deletedFiles };
}

/** One `A/M/D <path>` line per touched file, git-status style. */
export function formatPatchResult(result: ApplyPatchResult): string {
  return [
    ...result.addedFiles.map((f) => `A ${f}`),
    ...result.changedFiles.map((f) => `M ${f}`),
    ...result.deletedFiles.map((f) => `D ${f}`),
  ].join("\n");
}
