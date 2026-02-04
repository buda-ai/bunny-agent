import type { SandboxAdapter, SandboxHandle } from "@sandagent/manager";
import { describe, expect, it, vi } from "vitest";
import { submitAnswer } from "../provider/question-processor";

function createHandle() {
  return {
    getWorkdir: vi.fn(),
    exec: vi.fn(),
    upload: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    destroy: vi.fn(),
  } as unknown as SandboxHandle;
}

describe("submitAnswer", () => {
  it("uploads completed answers using existing handle", async () => {
    const handle = createHandle();
    const attach = vi.fn();
    const sandbox = {
      getHandle: () => handle,
      attach,
    } as unknown as SandboxAdapter;

    await submitAnswer(sandbox, {
      toolCallId: "tool-123",
      questions: [{ question: "Q1" }, { question: "Q2" }],
      answers: { Q1: "A1", Q2: "A2" },
    });

    expect(attach).not.toHaveBeenCalled();
    expect(handle.upload).toHaveBeenCalledTimes(1);

    const [files, targetDir] = (handle.upload as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(targetDir).toBe(".sandagent/approvals");
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("tool-123.json");

    const payload = JSON.parse(String(files[0].content));
    expect(payload.status).toBe("completed");
    expect(payload.answers).toEqual({ Q1: "A1", Q2: "A2" });
    expect(Array.isArray(payload.questions)).toBe(true);
    expect(typeof payload.timestamp).toBe("string");
  });

  it("uses attach when no handle exists and respects basePath", async () => {
    const handle = createHandle();
    const attach = vi.fn().mockResolvedValue(handle);
    const sandbox = {
      getHandle: () => null,
      attach,
    } as unknown as SandboxAdapter;

    await submitAnswer(
      sandbox,
      {
        toolCallId: "tool-456",
        questions: [{ question: "Q1" }],
        answers: { Q1: "A1" },
      },
      { basePath: "/custom/approvals" },
    );

    expect(attach).toHaveBeenCalledTimes(1);
    expect(handle.upload).toHaveBeenCalledTimes(1);

    const [files, targetDir] = (handle.upload as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(targetDir).toBe("/custom/approvals");
    expect(files[0].path).toBe("tool-456.json");
  });

  it("marks status as pending when some answers are missing", async () => {
    const handle = createHandle();
    const sandbox = {
      getHandle: () => handle,
      attach: vi.fn(),
    } as unknown as SandboxAdapter;

    await submitAnswer(sandbox, {
      toolCallId: "tool-789",
      questions: [{ question: "Q1" }, { question: "Q2" }],
      answers: { Q1: "A1", Q2: "" },
    });

    const [files] = (handle.upload as ReturnType<typeof vi.fn>).mock.calls[0];
    const payload = JSON.parse(String(files[0].content));
    expect(payload.status).toBe("pending");
  });
});
