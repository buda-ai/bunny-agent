import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  client: vi.fn(),
  ndJsonStream: vi.fn().mockReturnValue({}),
  initialize: vi.fn().mockResolvedValue({ protocolVersion: 1 }),
  prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
  updates: [] as unknown[],
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: mocks.spawn,
}));

vi.mock("@agentclientprotocol/sdk", () => ({
  PROTOCOL_VERSION: 1,
  methods: {
    agent: { initialize: "initialize" },
    client: { session: { requestPermission: "session/request_permission" } },
  },
  ndJsonStream: mocks.ndJsonStream,
  client: mocks.client,
}));

import { createAcpProcessRunner } from "../process-runner.js";

function mockChildProcess() {
  const child = {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    killed: false,
    once: vi.fn(),
    kill: vi.fn(function (this: { killed: boolean }) {
      this.killed = true;
      return true;
    }),
  };
  mocks.spawn.mockReturnValue(child);
  return child;
}

describe("createAcpProcessRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates = [];
    mockChildProcess();

    const session = {
      sessionId: "session-acp-1",
      prompt: mocks.prompt,
      nextUpdate: vi.fn().mockImplementation(async () => mocks.updates.shift()),
    };
    const context = {
      request: mocks.initialize,
      buildSession: vi.fn().mockReturnValue({
        withSession: async (operation: (value: typeof session) => unknown) =>
          operation(session),
      }),
    };
    const app = {
      onRequest: vi.fn().mockReturnThis(),
      connectWith: vi
        .fn()
        .mockImplementation(
          async (
            _stream: unknown,
            operation: (value: typeof context) => unknown,
          ) => operation(context),
        ),
    };
    mocks.client.mockReturnValue(app);
  });

  it("streams ACP text, reasoning, tools, usage, and session metadata", async () => {
    mocks.updates.push(
      {
        kind: "session_update",
        update: {
          sessionUpdate: "agent_message_chunk",
          messageId: "message-1",
          content: { type: "text", text: "Hello" },
        },
      },
      {
        kind: "session_update",
        update: {
          sessionUpdate: "agent_thought_chunk",
          messageId: "thought-1",
          content: { type: "text", text: "Thinking" },
        },
      },
      {
        kind: "session_update",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tool-1",
          title: "shell",
          status: "in_progress",
          rawInput: { command: "pwd" },
        },
      },
      {
        kind: "session_update",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "tool-1",
          status: "completed",
          rawOutput: "ok",
        },
      },
      {
        kind: "stop",
        stopReason: "end_turn",
        response: {
          stopReason: "end_turn",
          usage: {
            totalTokens: 9,
            inputTokens: 5,
            outputTokens: 4,
            cachedReadTokens: 2,
          },
        },
      },
    );

    const runner = createAcpProcessRunner({
      displayName: "Test Agent",
      command: "test-agent",
      args: ["acp"],
      cwd: "/tmp/project",
      systemPrompt: "Follow the project rules.",
    });
    const chunks: string[] = [];
    for await (const chunk of runner.run("Implement it")) chunks.push(chunk);

    expect(mocks.spawn).toHaveBeenCalledWith(
      "test-agent",
      ["acp"],
      expect.objectContaining({ cwd: "/tmp/project" }),
    );
    expect(mocks.initialize).toHaveBeenCalledWith("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
    });
    expect(mocks.prompt).toHaveBeenCalledWith(
      "Follow the project rules.\n\nImplement it",
    );
    const output = chunks.join("");
    expect(output).toContain('"sessionId":"session-acp-1"');
    expect(output).toContain('"type":"text-delta"');
    expect(output).toContain('"type":"reasoning"');
    expect(output).toContain('"type":"tool-input-start"');
    expect(output).toContain('"type":"tool-output-available"');
    expect(output).toContain('"input_tokens":5');
    expect(output).toContain("data: [DONE]");
  });

  it("returns a complete error stream when already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();
    const runner = createAcpProcessRunner({
      displayName: "Test Agent",
      command: "test-agent",
      abortController,
    });

    const chunks: string[] = [];
    for await (const chunk of runner.run("Ignored")) chunks.push(chunk);

    expect(mocks.spawn).not.toHaveBeenCalled();
    const output = chunks.join("");
    expect(output).toContain("aborted before start");
    expect(output).toContain('"finishReason":"error"');
    expect(output).toContain("data: [DONE]");
  });
});
