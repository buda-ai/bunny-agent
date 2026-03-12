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

it("streams tool execution and correctly identifies errors for command_execution", async () => {
  startThreadMock.mockReturnValue({
    runStreamed: vi.fn().mockResolvedValue({
      events: (async function* () {
        yield {
          type: "item.completed",
          item: {
            type: "command_execution",
            id: "call-123",
            status: "failed",
            exit_code: 1,
            aggregated_output: "command failed",
          },
        };
        yield {
          type: "turn.completed",
          usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
        };
      })(),
    }),
  });

  const runner = createCodexRunner({
    model: "codex-test",
    env: { OPENAI_API_KEY: "test" },
  });

  const chunks: string[] = [];
  for await (const chunk of runner.run("test tool error")) {
    chunks.push(chunk);
  }

  const toolOutputChunk = chunks.find((c) =>
    c.includes('"type":"tool-output-available"'),
  );
  expect(toolOutputChunk).toBeDefined();
  expect(toolOutputChunk).toContain('"isError":true');
});

it("streams tool execution and correctly identifies errors for mcp_tool_call", async () => {
  startThreadMock.mockReturnValue({
    runStreamed: vi.fn().mockResolvedValue({
      events: (async function* () {
        yield {
          type: "item.completed",
          item: {
            type: "mcp_tool_call",
            id: "mcp-123",
            status: "failed",
            error: { message: "Internal server error" },
          },
        };
        yield {
          type: "turn.completed",
          usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
        };
      })(),
    }),
  });

  const runner = createCodexRunner({
    model: "codex-test",
    env: { OPENAI_API_KEY: "test" },
  });

  const chunks: string[] = [];
  for await (const chunk of runner.run("test mcp error")) {
    chunks.push(chunk);
  }

  const toolOutputChunk = chunks.find((c) =>
    c.includes('"type":"tool-output-available"'),
  );
  expect(toolOutputChunk).toBeDefined();
  expect(toolOutputChunk).toContain('"isError":true');
});
