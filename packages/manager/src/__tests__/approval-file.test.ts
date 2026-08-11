import { describe, expect, it } from "vitest";
import { approvalFileName } from "../approval-file.js";

describe("approvalFileName", () => {
  it("preserves legacy filenames for normal tool call IDs", () => {
    expect(approvalFileName("tool-call_123.abc")).toBe(
      "tool-call_123.abc.json",
    );
  });

  it("hashes path-unsafe and oversized tool call IDs deterministically", () => {
    const toolCallId = `thought/${"opaque+payload".repeat(80)}`;
    const filename = approvalFileName(toolCallId);

    expect(filename).toMatch(/^hashed-[a-f0-9]{64}\.json$/);
    expect(filename).toBe(approvalFileName(toolCallId));
    expect(Buffer.byteLength(filename, "utf8")).toBeLessThan(255);
  });
});
