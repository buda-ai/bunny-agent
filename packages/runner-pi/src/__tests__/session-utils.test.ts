import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  extractLastCompactionSummary,
  isSessionFileTooLarge,
  MAX_SESSION_FILE_BYTES,
} from "../session-utils.js";

describe("session-utils", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-utils-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("isSessionFileTooLarge", () => {
    it("returns false for small files", () => {
      const file = join(tmpDir, "small.jsonl");
      writeFileSync(file, '{"type":"session"}\n');
      expect(isSessionFileTooLarge(file)).toBe(false);
    });

    it("returns true for files exceeding the limit", () => {
      const file = join(tmpDir, "large.jsonl");
      // Write a file just over the limit
      writeFileSync(file, "x".repeat(MAX_SESSION_FILE_BYTES + 1));
      expect(isSessionFileTooLarge(file)).toBe(true);
    });

    it("returns false for non-existent files", () => {
      expect(isSessionFileTooLarge(join(tmpDir, "nope.jsonl"))).toBe(false);
    });
  });

  describe("extractLastCompactionSummary", () => {
    it("returns undefined for non-existent file", () => {
      expect(
        extractLastCompactionSummary(join(tmpDir, "nope.jsonl")),
      ).toBeUndefined();
    });

    it("returns undefined when no compaction entry exists", () => {
      const file = join(tmpDir, "no-compact.jsonl");
      writeFileSync(
        file,
        [
          JSON.stringify({ type: "session", id: "s1" }),
          JSON.stringify({
            type: "message",
            id: "m1",
            message: { role: "user", content: "hi" },
          }),
        ].join("\n") + "\n",
      );
      expect(extractLastCompactionSummary(file)).toBeUndefined();
    });

    it("extracts the last compaction summary", () => {
      const file = join(tmpDir, "with-compact.jsonl");
      writeFileSync(
        file,
        [
          JSON.stringify({ type: "session", id: "s1" }),
          JSON.stringify({
            type: "message",
            id: "m1",
            message: { role: "user", content: "hi" },
          }),
          JSON.stringify({
            type: "compaction",
            id: "c1",
            summary: "First summary",
            firstKeptEntryId: "m1",
            tokensBefore: 1000,
          }),
          JSON.stringify({
            type: "message",
            id: "m2",
            message: { role: "user", content: "more" },
          }),
          JSON.stringify({
            type: "compaction",
            id: "c2",
            summary: "Second summary",
            firstKeptEntryId: "m2",
            tokensBefore: 2000,
          }),
          JSON.stringify({
            type: "message",
            id: "m3",
            message: { role: "user", content: "latest" },
          }),
        ].join("\n") + "\n",
      );
      expect(extractLastCompactionSummary(file)).toBe("Second summary");
    });

    it("handles file with only one compaction entry", () => {
      const file = join(tmpDir, "one-compact.jsonl");
      writeFileSync(
        file,
        [
          JSON.stringify({ type: "session", id: "s1" }),
          JSON.stringify({
            type: "compaction",
            id: "c1",
            summary: "Only summary",
            firstKeptEntryId: "s1",
            tokensBefore: 500,
          }),
        ].join("\n") + "\n",
      );
      expect(extractLastCompactionSummary(file)).toBe("Only summary");
    });

    it("reads from tail of large files without loading everything", () => {
      const file = join(tmpDir, "large-with-compact.jsonl");
      // Write a large file: lots of padding + compaction at the end
      const padding = (
        JSON.stringify({
          type: "message",
          id: "pad",
          message: { role: "user", content: "x".repeat(200) },
        }) + "\n"
      ).repeat(100);
      const compaction =
        JSON.stringify({
          type: "compaction",
          id: "c1",
          summary: "Tail summary",
          firstKeptEntryId: "pad",
          tokensBefore: 9999,
        }) + "\n";
      writeFileSync(file, padding + compaction);
      expect(extractLastCompactionSummary(file)).toBe("Tail summary");
    });

    it("handles empty file", () => {
      const file = join(tmpDir, "empty.jsonl");
      writeFileSync(file, "");
      expect(extractLastCompactionSummary(file)).toBeUndefined();
    });
  });
});
