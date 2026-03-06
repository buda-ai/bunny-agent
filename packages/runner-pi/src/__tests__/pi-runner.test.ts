import { beforeEach, describe, expect, it, vi } from "vitest";

const createdAgents: MockAgent[] = [];

class MockAgent {
  state: { error?: string } = {};
  private listeners: Array<(event: unknown) => void> = [];
  private behavior: "normal" | "pending" = "normal";

  subscribe(fn: (event: unknown) => void): () => void {
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
        // Keep pending for abort test.
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

  private emit(event: unknown): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

vi.mock("@mariozechner/pi-agent-core", () => ({
  Agent: vi.fn().mockImplementation(() => {
    const agent = new MockAgent();
    createdAgents.push(agent);
    return agent;
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

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createCodingTools: vi.fn().mockReturnValue([]),
}));

import { createPiRunner } from "../pi-runner.js";

describe("createPiRunner", () => {
  beforeEach(() => {
    createdAgents.length = 0;
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
    const controller = new AbortController();
    const runner = createPiRunner({
      model: "google:gemini-2.5-pro",
      abortController: controller,
    });

    const agent = createdAgents[0];
    agent.setBehavior("pending");

    const chunks: string[] = [];
    const runPromise = (async () => {
      for await (const chunk of runner.run("long task")) {
        chunks.push(chunk);
      }
    })();

    controller.abort();
    await runPromise;

    expect(chunks.some((c) => c.includes('"type":"error"'))).toBe(true);
    expect(chunks.some((c) => c.includes('"type":"finish"'))).toBe(true);
    expect(chunks.some((c) => c.includes("[DONE]"))).toBe(true);
  });
});
