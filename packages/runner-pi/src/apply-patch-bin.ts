/**
 * Standalone `apply_patch` CLI entry.
 *
 * GPT-5.x models frequently shell out `apply_patch <<'PATCH'` (often chained
 * after other commands: `mkdir -p x && cd x && apply_patch <<'PATCH'`), a
 * habit from OpenAI's Codex harness where apply_patch exists as a shell
 * command. This entry makes that invocation real:
 *
 * - Docker sandbox images install it as /usr/local/bin/apply_patch
 *   (importing runner-cli's bundled dist/apply-patch-bin.js).
 * - Non-Docker runs get it on the bash tool's PATH via apply-patch-shim.ts.
 *
 * Patch text comes from the first CLI argument if present, otherwise stdin
 * (the heredoc case). Paths resolve against the process cwd, so `cd` before
 * a chained apply_patch behaves exactly as the model expects.
 *
 * Executed for its side effects on import — this module is only ever used
 * as a process entry point, never imported as a library.
 */

import { readFileSync } from "node:fs";
import {
  applyPatch,
  formatPatchResult,
  PatchParseError,
} from "./apply-patch-core.js";

function readPatchText(): string {
  const arg = process.argv[2];
  if (arg !== undefined && arg.trim() !== "") return arg;
  if (process.stdin.isTTY) {
    process.stderr.write(
      "usage: apply_patch '<patch>'  (or pipe the patch via stdin/heredoc)\n",
    );
    process.exit(2);
  }
  // fd 0 read is fine here: stdin is a pipe, heredoc, or /dev/null.
  return readFileSync(0, "utf8");
}

try {
  const patchText = readPatchText();
  if (patchText.trim() === "") {
    throw new PatchParseError("Empty patch input.");
  }
  const result = applyPatch(process.cwd(), patchText);
  const summary = formatPatchResult(result);
  process.stdout.write(`${summary || "Patch applied."}\n`);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`apply_patch: ${msg}\n`);
  process.exit(1);
}
