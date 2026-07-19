import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPatch,
  buildApplyPatchTool,
  PatchParseError,
} from "../apply-patch-tool.js";

describe("apply-patch-tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "apply-patch-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("applyPatch", () => {
    it("adds a new file", () => {
      const patch = [
        "*** Begin Patch",
        "*** Add File: hello.txt",
        "+line one",
        "+line two",
        "*** End Patch",
      ].join("\n");

      const result = applyPatch(tmpDir, patch);

      expect(result.addedFiles).toEqual(["hello.txt"]);
      expect(readFileSync(join(tmpDir, "hello.txt"), "utf8")).toBe(
        "line one\nline two\n",
      );
    });

    it("updates a file by matching context and replacing a hunk", () => {
      writeFileSync(
        join(tmpDir, "foo.py"),
        "def foo():\n    return 1\n\ndef bar():\n    return 2\n",
      );
      const patch = [
        "*** Begin Patch",
        "*** Update File: foo.py",
        "@@ def foo():",
        " def foo():",
        "-    return 1",
        "+    return 42",
        "*** End Patch",
      ].join("\n");

      const result = applyPatch(tmpDir, patch);

      expect(result.changedFiles).toEqual(["foo.py"]);
      expect(readFileSync(join(tmpDir, "foo.py"), "utf8")).toBe(
        "def foo():\n    return 42\n\ndef bar():\n    return 2\n",
      );
    });

    it("applies multiple hunks in a single Update File section in order", () => {
      writeFileSync(join(tmpDir, "multi.txt"), "a\nb\nc\nd\ne\n");
      const patch = [
        "*** Begin Patch",
        "*** Update File: multi.txt",
        "@@",
        " a",
        "-b",
        "+B",
        "@@",
        " d",
        "-e",
        "+E",
        "*** End Patch",
      ].join("\n");

      applyPatch(tmpDir, patch);

      expect(readFileSync(join(tmpDir, "multi.txt"), "utf8")).toBe(
        "a\nB\nc\nd\nE\n",
      );
    });

    it("deletes a file", () => {
      const target = join(tmpDir, "gone.txt");
      writeFileSync(target, "bye\n");
      const patch = [
        "*** Begin Patch",
        "*** Delete File: gone.txt",
        "*** End Patch",
      ].join("\n");

      const result = applyPatch(tmpDir, patch);

      expect(result.deletedFiles).toEqual(["gone.txt"]);
      expect(existsSync(target)).toBe(false);
    });

    it("moves a file while applying update hunks", () => {
      writeFileSync(join(tmpDir, "old.txt"), "hello\n");
      const patch = [
        "*** Begin Patch",
        "*** Update File: old.txt",
        "*** Move to: new.txt",
        "@@",
        "-hello",
        "+hi",
        "*** End Patch",
      ].join("\n");

      const result = applyPatch(tmpDir, patch);

      expect(result.changedFiles).toEqual(["new.txt"]);
      expect(existsSync(join(tmpDir, "old.txt"))).toBe(false);
      expect(readFileSync(join(tmpDir, "new.txt"), "utf8")).toBe("hi\n");
    });

    it("tolerates trailing-whitespace drift in context lines", () => {
      writeFileSync(join(tmpDir, "ws.txt"), "foo   \nbar\n");
      const patch = [
        "*** Begin Patch",
        "*** Update File: ws.txt",
        "@@",
        "-foo",
        "+FOO",
        " bar",
        "*** End Patch",
      ].join("\n");

      applyPatch(tmpDir, patch);

      expect(readFileSync(join(tmpDir, "ws.txt"), "utf8")).toBe("FOO\nbar\n");
    });

    it("throws when update context cannot be located", () => {
      writeFileSync(join(tmpDir, "nope.txt"), "actual content\n");
      const patch = [
        "*** Begin Patch",
        "*** Update File: nope.txt",
        "@@",
        "-does not exist",
        "+replacement",
        "*** End Patch",
      ].join("\n");

      expect(() => applyPatch(tmpDir, patch)).toThrow(PatchParseError);
    });

    it("throws when the patch has no file operations", () => {
      const patch = "*** Begin Patch\n*** End Patch";
      expect(() => applyPatch(tmpDir, patch)).toThrow(PatchParseError);
    });
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
