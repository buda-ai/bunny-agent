/**
 * Runtime PATH shim so `apply_patch` exists as a real shell command for the
 * bash tool's child processes.
 *
 * Why a PATH shim instead of intercepting bash commands: GPT-5.x chains
 * apply_patch after other commands (`mkdir -p x && cd x && apply_patch
 * <<'PATCH'`), so recognizing it in the command string would require parsing
 * shell syntax (&&, ;, pipes, subshells) and tracking cwd changes. A real
 * executable on PATH lets the shell handle all of that natively.
 *
 * The shim is a two-line `sh` wrapper that execs the current Node binary on
 * the standalone `apply-patch-bin.js`. That file exists as a dist sibling of
 * this module in every deployment context, by construction:
 * - tsc builds (workspace dev, unbundled dist): `packages/runner-pi/dist/`
 *   contains both this module and apply-patch-bin.js.
 * - esbuild bundles (runner-cli, daemon): their build scripts emit a
 *   self-contained `dist/apply-patch-bin.js` next to the main bundle that
 *   this module is inlined into, so the same relative lookup works.
 *
 * If the sibling is missing (unknown packaging), the shim is skipped and
 * behavior falls back to today's: the native apply_patch tool still exists;
 * only the bash-heredoc habit fails.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SHIM_FILE = "apply_patch";

function resolveApplyPatchBin(): string | undefined {
  try {
    return fileURLToPath(new URL("./apply-patch-bin.js", import.meta.url));
  } catch {
    return undefined;
  }
}

/**
 * Materialize the shim directory and return its path, or undefined when the
 * shim cannot be provided (Windows, missing bin sibling, unwritable tmpdir).
 * The result is meant to be prepended to the bash tool's PATH.
 *
 * The directory is stable per user so repeated runner constructions reuse
 * it; the write goes through a rename for atomicity against a concurrent
 * bash child resolving the command mid-write.
 */
export function ensureApplyPatchShim(
  binPath: string | undefined = resolveApplyPatchBin(),
): string | undefined {
  if (
    process.platform === "win32" ||
    binPath === undefined ||
    !existsSync(binPath)
  ) {
    return undefined;
  }
  try {
    const uid = process.getuid?.() ?? 0;
    const shimDir = join(tmpdir(), `bunny-agent-apply-patch-${uid}`);
    mkdirSync(shimDir, { recursive: true });
    const script = `#!/bin/sh\nexec "${process.execPath}" "${binPath}" "$@"\n`;
    const staging = join(shimDir, `.${SHIM_FILE}.${process.pid}.tmp`);
    writeFileSync(staging, script);
    chmodSync(staging, 0o755);
    renameSync(staging, join(shimDir, SHIM_FILE));
    return shimDir;
  } catch {
    return undefined;
  }
}
