import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApplyPatchTool } from "../apply-patch-tool.js";

// The V4A parsing/applying engine itself is tested in
// @bunny-agent/apply-patch (packages/apply-patch/src/__tests__/core.test.ts).
// These tests only cover the pi ToolDefinition wrapper.
describe("apply-patch-tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "apply-patch-tool-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("buildApplyPatchTool", () => {
    it("returns a summary line per changed file", async () => {
      writeFileSync(join(tmpDir, "a.txt"), "one\n");
      const tool = buildApplyPatchTool(tmpDir);
      const patch = [
        "*** Begin Patch",
        "*** Update File: a.txt",
        "@@",
        "-one",
        "+two",
        "*** Add File: b.txt",
        "+new",
        "*** End Patch",
      ].join("\n");

      const result = await tool.execute(
        "call-1",
        { input: patch },
        new AbortController().signal,
        () => {},
        {} as Parameters<typeof tool.execute>[4],
      );

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("M a.txt");
      expect(text).toContain("A b.txt");
      expect(existsSync(join(tmpDir, "b.txt"))).toBe(true);
    });

    it("returns an error message instead of throwing on bad input", async () => {
      const tool = buildApplyPatchTool(tmpDir);
      const result = await tool.execute(
        "call-1",
        { input: "not a patch" },
        new AbortController().signal,
        () => {},
        {} as Parameters<typeof tool.execute>[4],
      );

      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain("Patch error");
    });
  });
});
