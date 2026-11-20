import {
  appendFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_LEGACY_SESSION_LINE_BYTES,
  MAX_SESSION_FILE_BYTES,
  prepareSessionFile,
  resolveSessionPathById,
} from "../session-utils.js";

const identity = (entry: unknown) => entry;

describe("lossless session preparation", () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-utils-test-"));
  });
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it("leaves a small transcript unchanged", () => {
    const file = join(tmpDir, "session.jsonl");
    const original = '{ "type": "session", "id": "s1" }\n';
    writeFileSync(file, original);
    expect(prepareSessionFile(file, identity).migrated).toBe(false);
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(readdirSync(tmpDir)).toEqual(["session.jsonl"]);
  });

  it("recovers every entry around a multi-MiB image line, including the newest instruction", () => {
    const file = join(tmpDir, "session.jsonl");
    const entries = [
      { type: "session", id: "s1" },
      {
        type: "message",
        id: "goal",
        parentId: null,
        message: { role: "user", content: "Create a video in Chinese" },
      },
      {
        type: "compaction",
        id: "summary",
        parentId: "goal",
        summary: "Video goal",
        firstKeptEntryId: "goal",
      },
      {
        type: "message",
        id: "image",
        parentId: "summary",
        data: "A".repeat(MAX_SESSION_FILE_BYTES + 1),
      },
      {
        type: "message",
        id: "latest",
        parentId: "image",
        message: {
          role: "user",
          content: "Use the second image and keep Chinese captions",
        },
      },
    ];
    const original = entries.map((entry) => JSON.stringify(entry)).join("\n");
    writeFileSync(file, original);
    const result = prepareSessionFile(file, (entry) => {
      const e = entry as Record<string, unknown>;
      return e.id === "image" ? { ...e, data: "media-reference" } : e;
    });
    expect(result.migrated).toBe(true);
    expect(result.metadataBytes).toBeLessThan(2048);
    expect(readFileSync(result.backupPath!, "utf8")).toBe(original);
    const recovered = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(recovered).toEqual(
      entries.map((e) =>
        e.id === "image" ? { ...e, data: "media-reference" } : e,
      ),
    );
    expect(recovered.at(-1).message.content).toContain("second image");
  });

  it("refuses text-only oversized sessions without creating a replacement or changing the source", () => {
    const file = join(tmpDir, "large.jsonl");
    const original = `${JSON.stringify({ text: "x".repeat(MAX_SESSION_FILE_BYTES) })}\n`;
    writeFileSync(file, original);
    expect(() => prepareSessionFile(file, identity)).toThrow(
      /No replacement session was created/,
    );
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(readdirSync(tmpDir)).toEqual(["large.jsonl"]);
  });

  it("refuses a malformed or interrupted line without replacing its original", () => {
    const file = join(tmpDir, "partial.jsonl");
    const original = '{"id":"one"}\n{"id":"two"';
    writeFileSync(file, original);
    expect(() => prepareSessionFile(file, () => ({ changed: true }))).toThrow(
      /line 2/,
    );
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(readdirSync(tmpDir)).toEqual(["partial.jsonl"]);
  });

  it("bounds even a single unterminated huge JSON line", () => {
    const file = join(tmpDir, "huge.jsonl");
    writeFileSync(file, Buffer.alloc(MAX_LEGACY_SESSION_LINE_BYTES + 1, 65));
    expect(() => prepareSessionFile(file, identity)).toThrow(/64 MiB/);
    expect(readdirSync(tmpDir)).toEqual(["huge.jsonl"]);
  });

  it("does not overwrite a transcript that was appended while migrating", () => {
    const file = join(tmpDir, "concurrent.jsonl");
    writeFileSync(file, '{"id":"one"}\n');
    let appended = false;
    expect(() =>
      prepareSessionFile(file, (entry) => {
        if (!appended) {
          appended = true;
          appendFileSync(file, '{"id":"two"}\n');
        }
        return { entry };
      }),
    ).toThrow(/changed during media migration/);
    expect(readFileSync(file, "utf8")).toContain('"two"');
    expect(readdirSync(tmpDir)).toEqual(["concurrent.jsonl"]);
  });

  it("resolves explicit paths without reading a transcript", () => {
    expect(resolveSessionPathById(tmpDir, "/tmp/session.jsonl")).toBe(
      "/tmp/session.jsonl",
    );
    expect(resolveSessionPathById(tmpDir, "missing-session")).toBeUndefined();
  });
});
