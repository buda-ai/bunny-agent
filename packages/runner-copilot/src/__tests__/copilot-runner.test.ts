import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn().mockReturnValue({ kind: "approved" }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue([]),
  forceStop: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn(),
  resumeSession: vi.fn(),
  send: vi.fn(),
  disconnect: vi.fn().mockResolvedValue(undefined),
  abort: vi.fn().mockResolvedValue(undefined),
  handler: undefined as ((event: unknown) => void) | undefined,
}));

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: mocks.CopilotClient,
  approveAll: mocks.approveAll,
}));

import { createCopilotRunner } from "../copilot-runner.js";

function event(type: string, data: Record<string, unknown>) {
  return {
    id: `${type}-id`,
    parentId: null,
    timestamp: new Date(0).toISOString(),
    type,
    data,
  };
}

describe("createCopilotRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handler = undefined;
    const session = {
      sessionId: "copilot-session-1",
      on: vi.fn((handler: (value: unknown) => void) => {
        mocks.handler = handler;
        return vi.fn();
      }),
      send: mocks.send,
      disconnect: mocks.disconnect,
      abort: mocks.abort,
    };
    mocks.createSession.mockResolvedValue(session);
    mocks.resumeSession.mockResolvedValue(session);
    mocks.CopilotClient.mockImplementation(() => ({
      start: mocks.start,
      stop: mocks.stop,
      forceStop: mocks.forceStop,
      createSession: mocks.createSession,
      resumeSession: mocks.resumeSession,
    }));
    mocks.send.mockImplementation(async () => {
      mocks.handler?.(
        event("assistant.message_delta", {
          messageId: "message-1",
          deltaContent: "Hello ",
        }),
      );
      mocks.handler?.(
        event("assistant.reasoning_delta", {
          reasoningId: "reasoning-1",
          deltaContent: "Think",
        }),
      );
      mocks.handler?.(
        event("tool.execution_start", {
          toolCallId: "tool-1",
          toolName: "shell",
          arguments: { command: "pwd" },
        }),
      );
      mocks.handler?.(
        event("tool.execution_complete", {
          toolCallId: "tool-1",
          success: true,
          result: { content: "/tmp/project" },
        }),
      );
      mocks.handler?.(
        event("assistant.message", {
          messageId: "message-1",
          content: "Hello world",
        }),
      );
      mocks.handler?.(
        event("assistant.usage", {
          model: "gpt-5",
          inputTokens: 10,
          outputTokens: 4,
          cacheReadTokens: 2,
          reasoningTokens: 1,
        }),
      );
      mocks.handler?.(event("session.idle", { aborted: false }));
      return "message-1";
    });
  });

  it("streams a Copilot session through the Bunny data protocol", async () => {
    const runner = createCopilotRunner({
      model: "copilot:gpt-5",
      cwd: "/tmp/project",
      systemPrompt: "Follow project rules.",
      allowedTools: ["shell"],
      yolo: true,
      reasoningEffort: "high",
    });
    const chunks: string[] = [];
    for await (const chunk of runner.run("Implement it")) chunks.push(chunk);

    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5",
        reasoningEffort: "high",
        workingDirectory: "/tmp/project",
        availableTools: ["shell"],
        systemMessage: {
          mode: "append",
          content: "Follow project rules.",
        },
        onPermissionRequest: mocks.approveAll,
      }),
    );
    expect(mocks.send).toHaveBeenCalledWith("Implement it");
    const output = chunks.join("");
    expect(output).toContain('"sessionId":"copilot-session-1"');
    expect(output).toContain('"delta":"Hello "');
    expect(output).toContain('"delta":"world"');
    expect(output).toContain('"type":"reasoning"');
    expect(output).toContain('"type":"tool-input-start"');
    expect(output).toContain('"type":"tool-output-available"');
    expect(output).toContain('"input_tokens":10');
    expect(output).toContain('"finishReason":"stop"');
    expect(output).toContain("data: [DONE]");
    expect(mocks.disconnect).toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalled();
  });

  it("resumes an existing Copilot session", async () => {
    const runner = createCopilotRunner({
      model: "gpt-5",
      resume: "existing-session",
      yolo: true,
    });

    for await (const _chunk of runner.run("Continue")) {
      // Drain the stream.
    }

    expect(mocks.resumeSession).toHaveBeenCalledWith(
      "existing-session",
      expect.objectContaining({ model: "gpt-5" }),
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("returns a complete error stream when already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const runner = createCopilotRunner({
      model: "gpt-5",
      abortController,
    });
    const chunks: string[] = [];
    for await (const chunk of runner.run("Ignored")) chunks.push(chunk);

    expect(mocks.CopilotClient).not.toHaveBeenCalled();
    expect(chunks.join("")).toContain("aborted before start");
    expect(chunks.at(-1)).toBe("data: [DONE]\n\n");
  });
});
