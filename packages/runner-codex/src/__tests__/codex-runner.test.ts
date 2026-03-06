import { describe, expect, it, vi } from "vitest";

const startThreadMock = vi.fn();
const resumeThreadMock = vi.fn();

vi.mock("@openai/codex-sdk", () => ({
  Codex: vi.fn().mockImplementation(() => ({
    startThread: startThreadMock,
    resumeThread: resumeThreadMock,
  })),
}));

import { createCodexRunner } from "../codex-runner.js";

describe("createCodexRunner", () => {
  it("streams assistant text and stop event", async () => {
    startThreadMock.mockReturnValue({
      runStreamed: vi.fn().mockResolvedValue({
        events: (async function* () {
          yield {
            type: "item.completed",
            item: { type: "agent_message", id: "m1", text: "Hello from Codex" },
          };
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 2,
            },
          };
        })(),
      }),
    });

    const runner = createCodexRunner({ model: "gpt-5-codex" });
    const chunks: string[] = [];

    for await (const chunk of runner.run("Say hello")) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.includes("Hello from Codex"))).toBe(true);
    expect(chunks.some((chunk) => chunk.includes("[DONE]"))).toBe(true);
  });

  it("uses resume thread when resume id is provided", async () => {
    resumeThreadMock.mockReturnValue({
      runStreamed: vi.fn().mockResolvedValue({
        events: (async function* () {
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 0,
              cached_input_tokens: 0,
              output_tokens: 0,
            },
          };
        })(),
      }),
    });

    const runner = createCodexRunner({
      model: "gpt-5-codex",
      resume: "thread-123",
    });

    const chunks: string[] = [];
    for await (const chunk of runner.run("Continue")) {
      chunks.push(chunk);
    }

    expect(resumeThreadMock).toHaveBeenCalledWith(
      "thread-123",
      expect.objectContaining({ model: "gpt-5-codex" }),
    );
    expect(chunks.some((chunk) => chunk.includes("[DONE]"))).toBe(true);
  });

  it("normalizes openai-prefixed model names for Codex", async () => {
    startThreadMock.mockReturnValue({
      runStreamed: vi.fn().mockResolvedValue({
        events: (async function* () {
          yield {
            type: "turn.completed",
            usage: {
              input_tokens: 0,
              cached_input_tokens: 0,
              output_tokens: 0,
            },
          };
        })(),
      }),
    });

    const runner = createCodexRunner({ model: "openai:5.2" });

    for await (const _chunk of runner.run("Ping")) {
      // Drain stream
    }

    expect(startThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-5.2" }),
    );
  });
});
