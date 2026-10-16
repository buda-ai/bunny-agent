import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  guardToolOutput,
  TOOL_OUTPUT_MAX_BYTES,
  TOOL_OUTPUT_MAX_LINES,
} from "../tool-output.js";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, tmpdir: vi.fn(actual.tmpdir) };
});

const systemTempDirectory = tmpdir();

describe("guardToolOutput", () => {
  let tempDirectory: string;

  beforeEach(async () => {
    tempDirectory = await mkdtemp(
      join(systemTempDirectory, "bunny-tool-output-test-"),
    );
    vi.mocked(tmpdir).mockReturnValue(tempDirectory);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDirectory, { recursive: true, force: true });
  });

  it.each([
    "",
    "  unchanged\n",
    "x".repeat(TOOL_OUTPUT_MAX_BYTES),
    "\n".repeat(TOOL_OUTPUT_MAX_LINES - 1),
  ])("leaves outputs within both limits unchanged without writing files (%#)", async (text) => {
    expect(await guardToolOutput(text)).toEqual({ text });
    expect(await readdir(tempDirectory)).toEqual([]);
  });

  it.each([
    "x".repeat(TOOL_OUTPUT_MAX_BYTES + 1),
    "event\n".repeat(TOOL_OUTPUT_MAX_LINES),
    "\u4e2d\u6587\ud83d\ude42".repeat(20_000),
    JSON.stringify({
      content: [
        {
          type: "text",
          text: JSON.stringify({ report: "work log\\n".repeat(400_000) }),
        },
      ],
    }),
  ])("bounds previews and saves the entire original response (%#)", async (text) => {
    const result = await guardToolOutput(text);
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(
      TOOL_OUTPUT_MAX_BYTES,
    );
    expect(result.text.split("\n").length).toBeLessThanOrEqual(
      TOOL_OUTPUT_MAX_LINES,
    );
    expect(result.text).not.toContain("\ufffd");
    expect(result.text).toContain("Tool output truncated:");
    expect(result.text).toContain("Use read with offset/limit");
    expect(result.outputGuard).toMatchObject({
      truncated: true,
      originalBytes: Buffer.byteLength(text),
      originalLines: text.split("\n").length,
    });
    const path = result.outputGuard!.fullOutputPath!;
    expect(path.startsWith(join(tempDirectory, "bunny-tool-output-"))).toBe(
      true,
    );
    expect(result.text).toContain(JSON.stringify(path));
    expect(await readFile(path, "utf8")).toBe(text);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("keeps concurrent responses in distinct files", async () => {
    const texts = Array.from(
      { length: 5 },
      (_, index) => `${index}:${"x".repeat(100_000)}`,
    );
    const results = await Promise.all(
      texts.map((text) => guardToolOutput(text)),
    );
    const paths = results.map((result) => result.outputGuard!.fullOutputPath!);
    expect(new Set(paths).size).toBe(5);
    expect(
      await Promise.all(paths.map((path) => readFile(path, "utf8"))),
    ).toEqual(texts);
  });

  it("still bounds output and reports when the temporary directory cannot store the full response", async () => {
    const blocked = join(tempDirectory, "blocked");
    await writeFile(blocked, "not a directory");
    vi.mocked(tmpdir).mockReturnValue(blocked);
    const result = await guardToolOutput("x".repeat(100_000));
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(
      TOOL_OUTPUT_MAX_BYTES,
    );
    expect(result.text).toContain("Full output could not be saved");
    expect(result.outputGuard).not.toHaveProperty("fullOutputPath");
  });
});
