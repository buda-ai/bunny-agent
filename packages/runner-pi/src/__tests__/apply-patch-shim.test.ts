import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureApplyPatchShim } from "../apply-patch-shim.js";

const isWindows = process.platform === "win32";

describe.skipIf(isWindows)("ensureApplyPatchShim", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "apply-patch-shim-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** A stand-in for apply-patch-bin.js that echoes its argv and stdin. */
  function writeStubBin(): string {
    const binPath = join(tmpDir, "stub-bin.js");
    writeFileSync(
      binPath,
      `const stdin = require("node:fs").readFileSync(0, "utf8");
process.stdout.write("argv=" + (process.argv[2] ?? "") + ";stdin=" + stdin);
`,
    );
    return binPath;
  }

  it("returns undefined when the bin does not exist", () => {
    // In vitest the module runs from src/, so the dist sibling never exists
    // and the default binPath resolution finds nothing on disk.
    expect(ensureApplyPatchShim()).toBeUndefined();
    expect(
      ensureApplyPatchShim(join(tmpDir, "missing-bin.js")),
    ).toBeUndefined();
  });

  it("materializes an executable apply_patch wrapper for the given bin", () => {
    const binPath = writeStubBin();
    const shimDir = ensureApplyPatchShim(binPath);
    expect(shimDir).toBeDefined();

    const shimPath = join(shimDir as string, "apply_patch");
    expect(existsSync(shimPath)).toBe(true);
    expect(statSync(shimPath).mode & 0o111).not.toBe(0);

    const script = readFileSync(shimPath, "utf8");
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toContain(process.execPath);
    expect(script).toContain(binPath);
  });

  it("shim forwards argv and stdin to the bin, including chained heredoc use", () => {
    const binPath = writeStubBin();
    const shimDir = ensureApplyPatchShim(binPath) as string;

    // The exact shape GPT-5.x emits: apply_patch chained after other
    // commands, patch delivered via heredoc, resolved through PATH.
    const out = execFileSync(
      "/bin/sh",
      ["-c", `cd "$WORK" && true && apply_patch <<'PATCH'\nhello\nPATCH`],
      {
        env: {
          ...process.env,
          PATH: `${shimDir}:${process.env.PATH}`,
          WORK: tmpDir,
        },
        encoding: "utf8",
      },
    );
    expect(out).toBe("argv=;stdin=hello\n");
  });

  it("is idempotent: repeated calls reuse the same shim dir", () => {
    const binPath = writeStubBin();
    const first = ensureApplyPatchShim(binPath);
    const second = ensureApplyPatchShim(binPath);
    expect(first).toBe(second);
  });
});
