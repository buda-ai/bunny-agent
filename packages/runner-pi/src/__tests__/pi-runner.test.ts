import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock session that drives the event loop ──────────────────────────

type Listener = (event: unknown) => void;

class MockSession {
  agent = { state: {}, setSystemPrompt: vi.fn() };
  sessionId = "mock-session-id";
  private listeners: Listener[] = [];
  private behavior:
    | "normal"
    | "pending"
    | "tool_error"
    | "text_tool_text_with_boundaries" = "normal";

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  setBehavior(
    behavior:
      | "normal"
      | "pending"
      | "tool_error"
      | "text_tool_text_with_boundaries",
  ): void {
    this.behavior = behavior;
  }

  async prompt(_userInput: string): Promise<void> {
    if (this.behavior === "pending") {
      return new Promise(() => {
        // Keep pending forever so the abort test can fire.
      });
    }

    if (this.behavior === "tool_error") {
      this.emit({
        type: "tool_execution_start",
        toolCallId: "tool_fail",
        toolName: "bash",
        args: { command: "exit 1" },
      });
      this.emit({
        type: "tool_execution_end",
        toolCallId: "tool_fail",
        toolName: "bash",
        // Use pi's actual ToolResult format: { content: [...], details: {} }
        result: {
          content: [{ type: "text", text: "command failed" }],
          details: {},
        },
        isError: true,
      });
      this.emit({ type: "agent_end", messages: [] });
      return;
    }

    if (this.behavior === "text_tool_text_with_boundaries") {
      this.emit({
        type: "message_update",
        assistantMessageEvent: { type: "text_start" },
      });
      this.emit({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "before tool" },
      });
      this.emit({
        type: "message_update",
        assistantMessageEvent: { type: "toolcall_start" },
      });
      this.emit({
        type: "tool_execution_start",
        toolCallId: "tool_2",
        toolName: "bash",
        args: { command: "echo hi" },
      });
      this.emit({
        type: "tool_execution_end",
        toolCallId: "tool_2",
        toolName: "bash",
        result: { content: [{ type: "text", text: "hi" }], details: {} },
      });
      this.emit({
        type: "message_update",
        assistantMessageEvent: { type: "text_start" },
      });
      this.emit({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "after tool" },
      });
      this.emit({ type: "agent_end", messages: [] });
      return;
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
      // Use pi's actual ToolResult format: { content: [...], details: {} }
      result: { content: [{ type: "text", text: "hi" }], details: {} },
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
let nextSessionBehavior:
  | "normal"
  | "pending"
  | "tool_error"
  | "text_tool_text_with_boundaries" = "normal";

/** When set, `createAgentSession` seeds `agent.state.systemPrompt` (simulates Pi after _rebuildSystemPrompt). */
const mockPiAgentState = vi.hoisted(() => ({
  baseSystemPrompt: undefined as string | undefined,
}));
const mockCreateCodingToolsState = vi.hoisted(() => ({
  lastOptions: undefined as unknown,
}));

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
    create: vi.fn().mockReturnValue({}),
    open: vi.fn().mockReturnValue({}),
    list: vi.fn().mockResolvedValue([]),
  },
  createAgentSession: vi.fn().mockImplementation(async () => {
    const session = new MockSession();
    session.setBehavior(nextSessionBehavior);
    if (mockPiAgentState.baseSystemPrompt !== undefined) {
      session.agent.state = { systemPrompt: mockPiAgentState.baseSystemPrompt };
    }
    createdSessions.push(session);
    return { session };
  }),
  createCodingTools: vi.fn().mockImplementation((_cwd: string, options) => {
    mockCreateCodingToolsState.lastOptions = options;
    return [
      { name: "read", execute: vi.fn() },
      { name: "bash", execute: vi.fn() },
      { name: "edit", execute: vi.fn() },
      { name: "write", execute: vi.fn() },
    ];
  }),
  createBashTool: vi.fn().mockReturnValue({
    name: "bash",
    label: "bash",
    description: "Execute a bash command",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
    execute: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      details: {},
    }),
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

import { createPiRunner, extractToolResultText } from "../pi-runner.js";

// ── extractToolResultText unit tests ─────────────────────────────────────────

describe("extractToolResultText", () => {
  it("extracts text from pi ToolResult content array", () => {
    expect(
      extractToolResultText({
        content: [{ type: "text", text: "hello world" }],
        details: {},
      }),
    ).toBe("hello world");
  });

  it("joins multiple text parts with newline", () => {
    expect(
      extractToolResultText({
        content: [
          { type: "text", text: "line 1" },
          { type: "text", text: "line 2" },
        ],
        details: {},
      }),
    ).toBe("line 1\nline 2");
  });

  it("skips non-text content entries", () => {
    expect(
      extractToolResultText({
        content: [
          { type: "image", url: "data:image/png;base64,abc" },
          { type: "text", text: "output" },
        ],
        details: {},
      }),
    ).toBe("output");
  });

  it("extracts timeout error message from pi's bash tool format", () => {
    const piResult = {
      content: [
        {
          type: "text",
          text: "partial stdout\n\nCommand timed out after 10 seconds",
        },
      ],
      details: {},
    };
    const text = extractToolResultText(piResult);
    expect(text).toBe("partial stdout\n\nCommand timed out after 10 seconds");
    // Must NOT be a JSON string like {"content":[...],"details":{}}
    expect(text).not.toContain('"content"');
  });

  it("returns string input unchanged", () => {
    expect(extractToolResultText("plain string")).toBe("plain string");
  });

  it("serialises unknown objects as JSON fallback", () => {
    const result = extractToolResultText({ foo: "bar" });
    expect(result).toBe('{"foo":"bar"}');
  });
});

describe("createPiRunner", () => {
  beforeEach(() => {
    createdSessions.length = 0;
    nextSessionBehavior = "normal";
    mockPiAgentState.baseSystemPrompt = undefined;
    mockCreateCodingToolsState.lastOptions = undefined;
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

  it("tool-output-available emits a plain string output (not raw pi object)", async () => {
    const runner = createPiRunner({ model: "google:gemini-2.5-pro" });
    const chunks: string[] = [];

    for await (const chunk of runner.run("say hello")) {
      chunks.push(chunk);
    }

    const outputChunk = chunks.find((c) =>
      c.includes('"type":"tool-output-available"'),
    );
    expect(outputChunk).toBeDefined();

    // Parse the SSE data and verify output is a plain string, not a pi object
    const data = JSON.parse(outputChunk!.replace(/^data: /, "").trim());
    expect(typeof data.output).toBe("string");
    expect(data.output).toBe("hi");
    // Must not be the raw pi ToolResult JSON object
    expect(data.output).not.toContain('"content"');
  });

  it("throws for invalid model format", () => {
    expect(() => createPiRunner({ model: "gemini-2.5-pro" })).toThrow(
      "Invalid pi model",
    );
  });

  it("merges CLI systemPrompt with Pi base prompt from agent state", async () => {
    mockPiAgentState.baseSystemPrompt = "PI_BASE_WITH_SKILLS";
    const runner = createPiRunner({
      model: "google:gemini-2.5-pro",
      systemPrompt: "HOST_APP_RULES",
    });
    for await (const _ of runner.run("hi")) {
      break;
    }
    expect(createdSessions[0].agent.setSystemPrompt).toHaveBeenCalledWith(
      "PI_BASE_WITH_SKILLS\n\n---\n\nHOST_APP_RULES",
    );
  });

  it("sets only CLI systemPrompt when Pi base is empty", async () => {
    mockPiAgentState.baseSystemPrompt = "";
    const runner = createPiRunner({
      model: "google:gemini-2.5-pro",
      systemPrompt: "HOST_ONLY",
    });
    for await (const _ of runner.run("hi")) {
      break;
    }
    expect(createdSessions[0].agent.setSystemPrompt).toHaveBeenCalledWith(
      "HOST_ONLY",
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

  it("creates separate text parts for text before and after tool", async () => {
    nextSessionBehavior = "text_tool_text_with_boundaries";
    const runner = createPiRunner({ model: "google:gemini-2.5-pro" });
    const chunks: string[] = [];

    for await (const chunk of runner.run("text tool text")) {
      chunks.push(chunk);
    }

    const textStartChunks = chunks.filter((c) =>
      c.includes('"type":"text-start"'),
    );
    const ids = textStartChunks.map((chunk) => {
      const parsed = JSON.parse(chunk.replace(/^data: /, "").trim()) as {
        id: string;
      };
      return parsed.id;
    });

    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(chunks.some((c) => c.includes('"type":"tool-input-start"'))).toBe(
      true,
    );
  });

  it("registers a custom bash tool with options.env injected into exec", async () => {
    const { createAgentSession: mockCreateAgentSession } = await import(
      "@mariozechner/pi-coding-agent"
    );
    const spy = vi.mocked(mockCreateAgentSession);
    spy.mockClear();

    const runner = createPiRunner({
      model: "google:gemini-2.5-pro",
      env: { OPENAI_API_KEY: "test-key", BUDA_API_URL: "https://example.com" },
    });

    for await (const _ of runner.run("verify env injection")) {
      break;
    }

    expect(spy).toHaveBeenCalled();
    const callArgs = spy.mock.calls[0]?.[0];
    const customTools = callArgs?.customTools ?? [];
    const bashTool = customTools.find((t) => t.name === "bash");
    expect(bashTool).toBeDefined();
  });

  it("does not mutate process.env when injecting runner env", async () => {
    const key = "__PI_RUNNER_ENV_LEAK_TEST__";
    delete process.env[key];
    const runner = createPiRunner({
      model: "google:gemini-2.5-pro",
      env: { [key]: "secret" },
    });

    for await (const _ of runner.run("verify no process env mutation")) {
      break;
    }

    // process.env must not be permanently modified
    expect(process.env[key]).toBeUndefined();
  });
});

it("emits isError flag when a tool execution fails", async () => {
  nextSessionBehavior = "tool_error";
  const runner = createPiRunner({ model: "openai:gpt-4o" });

  const chunks: string[] = [];
  for await (const chunk of runner.run("trigger tool error")) {
    chunks.push(chunk);
  }

  // We should see a tool-output-available chunk that includes isError:true
  const outputChunk = chunks.find((c) =>
    c.includes('"type":"tool-output-available"'),
  );
  expect(outputChunk).toBeDefined();
  expect(outputChunk).toContain('"isError":true');

  // The output must be a plain string, not the raw pi ToolResult object
  const data = JSON.parse(outputChunk!.replace(/^data: /, "").trim());
  expect(typeof data.output).toBe("string");
  expect(data.output).toBe("command failed");
});
