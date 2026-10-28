import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Minimal browser-bundling check for the contracts barrel (task 1.4):
 * esbuild with `platform: "browser"` must bundle `contracts/index.ts`
 * without any `node:*` external left unresolved, proving the browser-safe
 * barrel never pulls in `source-id.ts` (which imports `node:crypto`).
 */
describe("contracts browser bundling", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("bundles the browser-safe barrel for platform=browser with no node: externals", () => {
    tempDir = mkdtempSync(join(tmpdir(), "bunny-contracts-bundle-"));
    const entry = join(tempDir, "entry.ts");
    writeFileSync(
      entry,
      `export * from ${JSON.stringify(join(__dirname, "../contracts/index.ts"))};\n`,
      "utf8",
    );
    const outfile = join(tempDir, "out.js");

    // Running esbuild directly (not through a package script) keeps this
    // test independent of any workspace build pipeline; it only needs the
    // CLI binary, which is a transitive dependency already present in the
    // monorepo's node_modules.
    const esbuildBin = require.resolve("esbuild/bin/esbuild");
    expect(() =>
      execFileSync(
        process.execPath,
        [
          esbuildBin,
          entry,
          "--bundle",
          "--platform=browser",
          `--outfile=${outfile}`,
        ],
        { stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
