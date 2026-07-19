import { describe, expect, it, vi } from "vitest";

type Handler = (event: unknown) => void;

/**
 * Fake session that lets a test push events through the registered handler
 * and control when sendAndWait resolves.
 */
class FakeSession {
  sessionId = "session-abc";
  handler: Handler | null = null;
  aborted = false;
  private resolveSend: (() => void) | null = null;

  on(handler: Handler): () => void {
    this.handler = handler;
    return () => {
      this.handler = null;
    };
  }

  emit(event: unknown): void {
    this.handler?.(event);
  }

  sendAndWait(): Promise<undefined> {
    return new Promise<undefined>((resolve) => {
      this.resolveSend = () => resolve(undefined);
    });
  }

  finishSend(): void {
    this.resolveSend?.();
  }

  abort(): Promise<void> {
    this.aborted = true;
    return Promise.resolve();
  }
}

const createSessionMock = vi.fn();
const resumeSessionMock = vi.fn();
const stopMock = vi.fn().mockResolvedValue([]);

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn().mockImplementation(() => ({
    createSession: createSessionMock,
    resumeSession: resumeSessionMock,
    stop: stopMock,
  })),
  approveAll: vi.fn(),
}));

import { createCopilotRunner } from "../copilot-runner.js";

/**
 * Drives the runner while a script feeds events into the fake session.
 * `script` runs on the next microtasks after the handler is registered.
 */
async function collect(
  runner: { run(input: string): AsyncIterable<string> },
  script: () => void | Promise<void>,
): Promise<string[]> {
  const chunks: string[] = [];
  const iterator = runner.run("hello")[Symbol.asyncIterator]();

  // Pull the first chunk. This drives the generator through its async setup
  // (createSession, session.on registration, sendAndWait) so the handler is
  // wired before the script emits any events.
  const first = await iterator.next();
  if (!first.done) chunks.push(first.value);

  // Now the handler is registered; feed events into the fake session.
  await script();

  while (true) {
    const { value, done } = await iterator.next();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

describe("createCopilotRunner", () => {
  it("streams assistant text, tool calls, and a finish/DONE with sessionId", async () => {
    const session = new FakeSession();
    createSessionMock.mockResolvedValue(session);

    const runner = createCopilotRunner({ model: "gpt-5" });
    const chunks = await collect(runner, () => {
      session.emit({
        type: "assistant.message_start",
        data: { messageId: "m1" },
      });
      session.emit({
        type: "assistant.message_delta",
        data: { messageId: "m1", deltaContent: "Hello from Copilot" },
      });
      session.emit({
        type: "assistant.message",
        data: { messageId: "m1", content: "Hello from Copilot" },
      });
      session.emit({
        type: "tool.execution_start",
        data: {
          toolCallId: "t1",
          toolName: "shell",
          arguments: { command: "ls" },
        },
      });
      session.emit({
        type: "tool.execution_complete",
        data: {
          toolCallId: "t1",
          success: true,
          result: { content: "file.txt" },
        },
      });
      session.emit({
        type: "assistant.usage",
        data: { inputTokens: 5, outputTokens: 7, cacheReadTokens: 2 },
      });
      session.emit({ type: "session.idle", data: {} });
      session.finishSend();
    });

    const joined = chunks.join("");
    expect(joined).toContain('"type":"message-metadata"');
    expect(joined).toContain('"sessionId":"session-abc"');
    expect(joined).toContain("Hello from Copilot");
    expect(joined).toContain('"type":"text-end"');
    expect(joined).toContain('"type":"tool-input-available"');
    expect(joined).toContain('"type":"tool-output-available"');
    expect(joined).toContain('"input_tokens":5');
    expect(joined).toContain('"output_tokens":7');
    expect(joined).toContain('"cache_read_input_tokens":2');
    expect(joined).toContain('"finishReason":"stop"');
    expect(chunks.some((c) => c.includes("[DONE]"))).toBe(true);
  });

  it("marks failed tool executions as errors", async () => {
    const session = new FakeSession();
    createSessionMock.mockResolvedValue(session);

    const runner = createCopilotRunner({ model: "gpt-5" });
    const chunks = await collect(runner, () => {
      session.emit({
        type: "tool.execution_start",
        data: { toolCallId: "t9", toolName: "write", arguments: {} },
      });
      session.emit({
        type: "tool.execution_complete",
        data: {
          toolCallId: "t9",
          success: false,
          error: { message: "permission denied" },
        },
      });
      session.emit({ type: "session.idle", data: {} });
      session.finishSend();
    });

    const toolOutput = chunks.find((c) =>
      c.includes('"type":"tool-output-available"'),
    );
    expect(toolOutput).toBeDefined();
    expect(toolOutput).toContain('"isError":true');
    expect(toolOutput).toContain("permission denied");
  });

  it("emits an error + finish on session.error", async () => {
    const session = new FakeSession();
    createSessionMock.mockResolvedValue(session);

    const runner = createCopilotRunner({ model: "gpt-5" });
    const chunks = await collect(runner, () => {
      session.emit({
        type: "session.error",
        data: { errorType: "quota", message: "quota exceeded" },
      });
      session.finishSend();
    });

    const joined = chunks.join("");
    expect(joined).toContain('"type":"error"');
    expect(joined).toContain("quota exceeded");
    expect(joined).toContain('"finishReason":"error"');
    expect(chunks.some((c) => c.includes("[DONE]"))).toBe(true);
  });

  it("uses resumeSession when a resume id is provided", async () => {
    const session = new FakeSession();
    resumeSessionMock.mockResolvedValue(session);

    const runner = createCopilotRunner({ model: "gpt-5", resume: "sess-42" });
    await collect(runner, () => {
      session.emit({ type: "session.idle", data: {} });
      session.finishSend();
    });

    expect(resumeSessionMock).toHaveBeenCalledWith(
      "sess-42",
      expect.objectContaining({ model: "gpt-5" }),
    );
  });

  it("synthesizes an error when the stream ends without a terminal event", async () => {
    const session = new FakeSession();
    createSessionMock.mockResolvedValue(session);

    const runner = createCopilotRunner({ model: "gpt-5" });
    const chunks = await collect(runner, () => {
      // Resolve the turn without ever emitting session.idle.
      session.finishSend();
    });

    const joined = chunks.join("");
    expect(joined).toContain("ended unexpectedly");
    expect(joined).toContain('"finishReason":"error"');
    expect(chunks.some((c) => c.includes("[DONE]"))).toBe(true);
  });
});
