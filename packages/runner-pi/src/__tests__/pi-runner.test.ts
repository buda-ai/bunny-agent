import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock session that drives the event loop ──────────────────────────

type Listener = (event: unknown) => void;

class MockSession {
  agent = { state: {}, setSystemPrompt: vi.fn() };
  sessionId = "mock-session-id";
  private listeners: Listener[] = [];
  private behavior: "normal" | "pending" = "normal";

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  setBehavior(behavior: "normal" | "pending"): void {
    this.behavior = behavior;
  }

  async prompt(_userInput: string): Promise<void> {
    if (this.behavior === "pending") {
      return new Promise(() => {
        // Keep pending forever so the abort test can fire.
      });
    }

    this.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Hello " },
    });
    this.emit({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "from Pi" },
    });
    this.emit({
      type: "tool_execution_start",
      toolCallId: "tool_1",
      toolName: "bash",
      args: { command: "echo hi" },
    });
    this.emit({
      type: "tool_execution_end",
      toolCallId: "tool_1",
      toolName: "bash",
      result: { stdout: "hi" },
    });
    this.emit({ type: "agent_end", messages: [] });
  }

  abort(): void {
    this.emit({ type: "agent_end", messages: [] });
  }

  dispose(): void {}

  private emit(event: unknown): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

const createdSessions: MockSession[] = [];
let nextSessionBehavior: "normal" | "pending" = "normal";

vi.mock("@mariozechner/pi-coding-agent", () => ({
  AuthStorage: {
    create: vi.fn().mockReturnValue({}),
  },
  ModelRegistry: vi.fn().mockImplementation(function (this: unknown) {
    return {
      find: vi.fn().mockReturnValue(undefined),
      registerProvider: vi.fn(),
    };
  }),
  SessionManager: {
    continueRecent: vi.fn().mockReturnValue({}),
    open: vi.fn().mockReturnValue({}),
    list: vi.fn().mockResolvedValue([]),
  },
  createAgentSession: vi.fn().mockImplementation(async () => {
    const session = new MockSession();
    session.setBehavior(nextSessionBehavior);
    createdSessions.push(session);
    return { session };
  }),
}));

vi.mock("@mariozechner/pi-ai", () => ({
  getModel: vi
    .fn()
    .mockImplementation((_provider: string, modelName: string) => ({
      name: modelName,
      baseUrl: "https://example.com",
    })),
}));

import { createPiRunner } from "../pi-runner.js";

describe("createPiRunner", () => {
  beforeEach(() => {
    createdSessions.length = 0;
    nextSessionBehavior = "normal";
  });

  it("streams text/tool events and finishes", async () => {
    const runner = createPiRunner({ model: "google:gemini-2.5-pro" });
    const chunks: string[] = [];

    for await (const chunk of runner.run("say hello")) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.includes('"type":"start"'))).toBe(true);
    expect(chunks.some((c) => c.includes('"type":"text-delta"'))).toBe(true);
    expect(chunks.some((c) => c.includes('"type":"tool-input-start"'))).toBe(
      true,
    );
    expect(
      chunks.some((c) => c.includes('"type":"tool-output-available"')),
    ).toBe(true);
    expect(chunks.some((c) => c.includes('"type":"finish"'))).toBe(true);
    expect(chunks.some((c) => c.includes("[DONE]"))).toBe(true);
  });

  it("throws for invalid model format", () => {
    expect(() => createPiRunner({ model: "gemini-2.5-pro" })).toThrow(
      "Invalid pi model",
    );
  });

  it("emits abort error stream when aborted", async () => {
    // Tell the next session to hang on prompt so we can abort mid-flight.
    nextSessionBehavior = "pending";

    const controller = new AbortController();
    const runner = createPiRunner({
      model: "google:gemini-2.5-pro",
      abortController: controller,
    });

    const readPromise = (async () => {
      const chunks: string[] = [];
      for await (const chunk of runner.run("long task")) {
        chunks.push(chunk);
      }
      return chunks;
    })();

    // Give the generator time to enter the event loop
    await new Promise((r) => setTimeout(r, 10));

    controller.abort();
    const chunks = await readPromise;

    expect(chunks.some((c) => c.includes('"type":"error"'))).toBe(true);
    expect(chunks.some((c) => c.includes('"type":"finish"'))).toBe(true);
    expect(chunks.some((c) => c.includes("[DONE]"))).toBe(true);
  });
});
