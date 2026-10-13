import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...actual, createReadTool: vi.fn(actual.createReadTool) };
});

import { createReadTool } from "@earendil-works/pi-coding-agent";
import { buildReadImageTool as createImageTool } from "../read-image-tool.js";
import { gateToolsForApproval } from "../tool-approval.js";

const visionModel = {
  id: "vision-test",
  input: ["text", "image"] as ("text" | "image")[],
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function buildReadImageTool(...args: Parameters<typeof createImageTool>) {
  const tool = createImageTool(...args);
  return {
    ...tool,
    execute: (
      id: string,
      params: { file_path: string },
      signal?: AbortSignal,
    ) =>
      tool.execute(
        id,
        params,
        signal,
        undefined,
        {} as Parameters<typeof tool.execute>[4],
      ),
  };
}

function bitmap(width: number, height: number): Buffer {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const data = Buffer.alloc(54 + stride * height, 255);
  data.fill(0, 0, 54);
  data.write("BM");
  data.writeUInt32LE(data.length, 2);
  data.writeUInt32LE(54, 10);
  data.writeUInt32LE(40, 14);
  data.writeInt32LE(width, 18);
  data.writeInt32LE(height, 22);
  data.writeUInt16LE(1, 26);
  data.writeUInt16LE(24, 28);
  data.writeUInt32LE(stride * height, 34);
  return data;
}

describe("native read_image tool", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "bunny-read-image-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("returns native image bytes for a relative file path", async () => {
    await writeFile(join(cwd, "pixel.png"), png);
    const tool = buildReadImageTool(cwd, () => visionModel);
    const result = await tool.execute("read-pixel", { file_path: "pixel.png" });

    expect(tool.name).toBe("read_image");
    expect(tool.label).toBe("ReadImage");
    expect(result.content).toContainEqual({
      type: "image",
      mimeType: "image/png",
      data: png.toString("base64"),
    });
  });

  it("decodes and resizes a large image through Pi", async () => {
    await writeFile(join(cwd, "wide.bmp"), bitmap(4096, 128));
    const result = await buildReadImageTool(cwd, () => visionModel).execute(
      "read-wide",
      { file_path: join(cwd, "wide.bmp") },
    );

    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image", mimeType: "image/png" }),
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("original 4096x128"),
        }),
      ]),
    );
    const image = result.content.find((block) => block.type === "image");
    expect(image?.type).toBe("image");
    if (image?.type === "image") {
      const bytes = Buffer.from(image.data, "base64");
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(bytes.readUInt32BE(16)).toBeLessThan(4096);
    }
  });

  it.each([
    ["notes.txt", Buffer.from("This is text, not an image")],
    ["broken.png", png.subarray(0, 24)],
    [
      "unsupported.svg",
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ],
  ])("rejects %s without returning text as an image", async (filePath, data) => {
    await writeFile(join(cwd, filePath), data);
    await expect(
      buildReadImageTool(cwd, () => visionModel).execute("invalid-image", {
        file_path: filePath,
      }),
    ).rejects.toThrow(/Cannot read this file as an image/);
  });

  it("rejects a missing file", async () => {
    await expect(
      buildReadImageTool(cwd, () => visionModel).execute("missing-image", {
        file_path: "missing.png",
      }),
    ).rejects.toThrow(/ENOENT/);
  });

  it("rejects text-only models before accessing a missing path", async () => {
    const tool = buildReadImageTool(cwd, () => ({
      id: "text-only",
      input: ["text"],
    }));
    await expect(
      tool.execute("text-model", { file_path: "missing.png" }),
    ).rejects.toThrow(/text-only.*does not support image input.*OCR/);
  });

  it("uses the current context model when it differs from the initial model", async () => {
    const tool = createImageTool(cwd, () => visionModel);
    await expect(
      tool.execute(
        "switched-model",
        { file_path: "missing.png" },
        undefined,
        undefined,
        { model: { id: "current-text-only", input: ["text"] } } as Parameters<
          typeof tool.execute
        >[4],
      ),
    ).rejects.toThrow(/current-text-only.*does not support image input/);
  });

  it.each(["", "   "])("rejects an empty file_path (%j)", async (filePath) => {
    await expect(
      buildReadImageTool(cwd, () => visionModel).execute("empty-path", {
        file_path: filePath,
      }),
    ).rejects.toThrow("file_path must be a non-empty string");
  });

  it("rejects a pre-aborted invocation before reading", async () => {
    const signal = AbortSignal.abort(new Error("Cancelled before read"));
    await expect(
      buildReadImageTool(cwd, () => visionModel).execute(
        "aborted",
        { file_path: "missing.png" },
        signal,
      ),
    ).rejects.toThrow("Cancelled before read");
  });

  it("does not return an image when cancelled during the underlying read", async () => {
    const controller = new AbortController();
    vi.mocked(createReadTool).mockReturnValueOnce({
      execute: async () => {
        controller.abort(new Error("Cancelled during read"));
        return {
          content: [{ type: "image", mimeType: "image/png", data: "image" }],
          details: {},
        };
      },
    } as unknown as ReturnType<typeof createReadTool>);
    await expect(
      buildReadImageTool(cwd, () => visionModel).execute(
        "cancel-read",
        { file_path: "pixel.png" },
        controller.signal,
      ),
    ).rejects.toThrow("Cancelled during read");
  });

  it("redacts text secrets without changing image data", async () => {
    const secret = "private-secret-value";
    vi.mocked(createReadTool).mockReturnValueOnce({
      execute: async () => ({
        content: [
          { type: "text", text: `Image note contains ${secret}` },
          { type: "image", mimeType: "image/png", data: secret },
        ],
        details: {},
      }),
    } as unknown as ReturnType<typeof createReadTool>);
    const result = await buildReadImageTool(cwd, () => visionModel, {
      KEY: secret,
    }).execute("redact-note", { file_path: "pixel.png" });
    expect(result.content).toEqual([
      { type: "text", text: "Image note contains ***" },
      { type: "image", mimeType: "image/png", data: secret },
    ]);
  });

  it("approval denial prevents any image read", async () => {
    const read = vi.fn();
    vi.mocked(createReadTool).mockReturnValueOnce({
      execute: read,
    } as unknown as ReturnType<typeof createReadTool>);
    const [gated] = gateToolsForApproval(
      [buildReadImageTool(cwd, () => visionModel)],
      false,
      {
        cwd,
        timeoutMs: 0,
      },
    );
    await expect(
      gated.execute(
        "approval-denied",
        { file_path: "pixel.png" },
        undefined,
        undefined,
        {} as Parameters<typeof gated.execute>[4],
      ),
    ).rejects.toThrow(/read_image.*was not approved/);
    expect(read).not.toHaveBeenCalled();
  });
});
