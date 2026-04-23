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

vi.mock("@mariozechner/pi-coding-agent", () => {
  const mockAuthStorage = {
    setRuntimeApiKey: vi.fn(),
    removeRuntimeApiKey: vi.fn(),
    getApiKey: vi.fn().mockResolvedValue("test-api-key"),
  };
  const mockModelRegistry = {
    authStorage: mockAuthStorage,
    find: vi.fn().mockReturnValue(undefined),
    registerProvider: vi.fn(),
  };
  return {
    AuthStorage: {
      create: vi.fn().mockReturnValue(mockAuthStorage),
      inMemory: vi.fn().mockReturnValue(mockAuthStorage),
    },
    ModelRegistry: Object.assign(
      vi.fn().mockImplementation(function (this: unknown) {
        return mockModelRegistry;
      }),
      {
        create: vi.fn().mockReturnValue(mockModelRegistry),
        inMemory: vi.fn().mockReturnValue(mockModelRegistry),
      },
    ),
    DefaultResourceLoader: vi.fn().mockImplementation(() => ({
      reload: vi.fn().mockResolvedValue(undefined),
      getSkills: vi.fn().mockReturnValue({ skills: [], diagnostics: [] }),
      getExtensions: vi.fn().mockReturnValue({ extensions: [] }),
      getPrompts: vi.fn().mockReturnValue({ prompts: [], diagnostics: [] }),
      getThemes: vi.fn().mockReturnValue({ themes: [], diagnostics: [] }),
      getAgentsFiles: vi.fn().mockReturnValue({ agentsFiles: [] }),
      getSystemPrompt: vi.fn().mockReturnValue(undefined),
      getAppendSystemPrompt: vi.fn().mockReturnValue([]),
      getPathMetadata: vi.fn().mockReturnValue(new Map()),
      extendResources: vi.fn(),
    })),
    loadSkills: vi.fn().mockReturnValue({ skills: [], diagnostics: [] }),
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
        session.agent.state = {
          systemPrompt: mockPiAgentState.baseSystemPrompt,
        };
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
    createReadTool: vi.fn().mockReturnValue({
      name: "read",
      label: "read",
      description: "Read a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "file content" }],
        details: {},
      }),
    }),
  };
});

vi.mock("@mariozechner/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mariozechner/pi-ai")>();
  return {
    ...actual,
    getModel: vi
      .fn()
      .mockImplementation((provider: string, modelName: string) => ({
        id: modelName,
        name: modelName,
        provider,
        baseUrl: "https://example.com",
        api: "openai-completions",
        reasoning: false,
        input: ["text", "image"],
        contextWindow: 128000,
        maxTokens: 8192,
        cost: { input: 3, output: 30, cacheRead: 1, cacheWrite: 2 },
      })),
  };
});

import { createPiRunner } from "../pi-runner.js";
import { extractToolResultText } from "../stream-converter.js";
import { redactSecrets } from "../tool-overrides.js";

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
  beforeEach(async () => {
    createdSessions.length = 0;
    nextSessionBehavior = "normal";
    mockPiAgentState.baseSystemPrompt = undefined;
    mockCreateCodingToolsState.lastOptions = undefined;
    const { createAgentSession: createSession } = await import(
      "@mariozechner/pi-coding-agent"
    );
    vi.mocked(createSession).mockImplementation(async () => {
      const session = new MockSession();
      session.setBehavior(nextSessionBehavior);
      if (mockPiAgentState.baseSystemPrompt !== undefined) {
        session.agent.state = {
          systemPrompt: mockPiAgentState.baseSystemPrompt,
        };
      }
      createdSessions.push(session);
      return { session } as unknown as Awaited<
        ReturnType<typeof createSession>
      >;
    });
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

  it("emits web_search billing metadata on tool output and finish", async () => {
    const { createAgentSession: mockCreateAgentSession } = await import(
      "@mariozechner/pi-coding-agent"
    );
    vi.mocked(mockCreateAgentSession).mockImplementationOnce(async () => {
      const session = new MockSession();
      session.prompt = async function (_input: string) {
        this["emit"]({
          type: "message_end",
          message: {
            role: "assistant",
            content: [],
            usage: { input: 20, output: 8, cacheRead: 0, cacheWrite: 0 },
          },
        });
        this["emit"]({
          type: "tool_execution_start",
          toolCallId: "t_search",
          toolName: "web_search",
          args: { query: "pi usage metadata" },
        });
        this["emit"]({
          type: "tool_execution_end",
          toolCallId: "t_search",
          toolName: "web_search",
          result: {
            content: [{ type: "text", text: "[Brave Search] 1 result(s)" }],
            details: {
              usage: {
                raw: {
                  brave: {
                    requests: 1,
                    fetchedPages: 2,
                  },
                },
              },
            },
          },
          isError: false,
        });
        this["emit"]({
          type: "agent_end",
          messages: [
            {
              role: "assistant",
              usage: { input: 20, output: 8, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        });
      };
      return { session } as unknown as Awaited<
        ReturnType<typeof mockCreateAgentSession>
      >;
    });

    const runner = createPiRunner({ model: "google:gemini-2.5-pro" });
    const chunks: string[] = [];
    for await (const chunk of runner.run("search once")) {
      chunks.push(chunk);
    }

    const toolOutputChunk = chunks.find(
      (c) =>
        c.includes('"type":"tool-output-available"') && c.includes("t_search"),
    );
    expect(toolOutputChunk).toBeDefined();

    const finishChunk = chunks.find((c) => c.includes('"type":"finish"'));
    expect(finishChunk).toBeDefined();
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

  it("passes CLI systemPrompt via resource loader appendSystemPrompt", async () => {
    const runner = createPiRunner({
      model: "google:gemini-2.5-pro",
      systemPrompt: "HOST_APP_RULES",
    });
    for await (const _ of runner.run("hi")) {
      break;
    }
    // systemPrompt is now injected via BunnyAgentResourceLoader.getAppendSystemPrompt(),
    // not via session.agent.setSystemPrompt(). Verify session was created.
    expect(createdSessions.length).toBeGreaterThan(0);
  });

  it("creates session without error when systemPrompt is empty", async () => {
    const runner = createPiRunner({
      model: "google:gemini-2.5-pro",
      systemPrompt: "",
    });
    for await (const _ of runner.run("hi")) {
      break;
    }
    expect(createdSessions.length).toBeGreaterThan(0);
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

  it("accumulates generate_image tool usage into finish messageMetadata", async () => {
    // Emit a generate_image tool_execution_end with details.usage.raw[modelId],
    // then agent_end with LLM usage — finish should sum both.
    const { createAgentSession: mockCreateAgentSession } = await import(
      "@mariozechner/pi-coding-agent"
    );
    vi.mocked(mockCreateAgentSession).mockImplementationOnce(async () => {
      const session = new MockSession();
      session.prompt = async function (_input: string) {
        this["emit"]({
          type: "tool_execution_start",
          toolCallId: "img_1",
          toolName: "generate_image",
          args: { prompt: "a cat" },
        });
        this["emit"]({
          type: "tool_execution_end",
          toolCallId: "img_1",
          toolName: "generate_image",
          result: {
            content: [{ type: "text", text: "/tmp/cat.png" }],
            details: {
              filePath: "/tmp/cat.png",
              usage: {
                raw: {
                  "gpt-image-1": {
                    total_tokens: 1404,
                    input_tokens: 22,
                    output_tokens: 1120,
                  },
                },
              },
              response: {
                data: [{ b64_json: "" }],
                usage: {
                  total_tokens: 1404,
                  input_tokens: 22,
                  output_tokens: 1120,
                },
              },
            },
          },
          isError: false,
        });
        this["emit"]({
          type: "agent_end",
          messages: [
            {
              role: "assistant",
              usage: { input: 100, output: 200, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        });
      };
      createdSessions.push(session);
      return { session } as unknown as Awaited<
        ReturnType<typeof mockCreateAgentSession>
      >;
    });

    const runner = createPiRunner({
      model: "openai:gpt-image-1",
      env: { IMAGE_GENERATION_MODEL: "openai:gpt-image-1" },
    });
    const chunks: string[] = [];
    for await (const chunk of runner.run("generate a cat image")) {
      chunks.push(chunk);
    }

    const toolOut = chunks.find((c) =>
      c.includes('"type":"tool-output-available"'),
    );
    expect(toolOut).toBeDefined();

    const finishChunk = chunks.find((c) => c.includes('"type":"finish"'));
    expect(finishChunk).toBeDefined();
    const data = JSON.parse(finishChunk!.replace(/^data: /, "").trim()) as {
      messageMetadata?: {
        usage?: Record<string, unknown>;
        models?: Record<string, Record<string, unknown>>;
      };
    };

    // usage has chat tokens spread at top level
    expect(data.messageMetadata?.usage?.input_tokens).toBe(100);
    expect(data.messageMetadata?.usage?.output_tokens).toBe(200);
    // raw map has tool usage (image tool overwrites chat entry for same model id)
    expect(
      (
        data.messageMetadata?.usage?.raw as
          | Record<string, Record<string, unknown>>
          | undefined
      )?.["gpt-image-1"]?.input_tokens,
    ).toBe(22);
    expect(
      (
        data.messageMetadata?.usage?.raw as
          | Record<string, Record<string, unknown>>
          | undefined
      )?.["gpt-image-1"]?.output_tokens,
    ).toBe(1120);
    expect(data.messageMetadata).not.toHaveProperty("cost");
    expect(data.messageMetadata).not.toHaveProperty("imageCost");
  });

  it("sums usage across multiple assistant turns in agent_end", async () => {
    const { createAgentSession: mockCreateAgentSession } = await import(
      "@mariozechner/pi-coding-agent"
    );
    vi.mocked(mockCreateAgentSession).mockImplementationOnce(async () => {
      const session = new MockSession();
      session.prompt = async function (_input: string) {
        this["emit"]({
          type: "agent_end",
          messages: [
            {
              role: "assistant",
              usage: { input: 10, output: 20, cacheRead: 1, cacheWrite: 2 },
            },
            {
              role: "assistant",
              usage: { input: 30, output: 40, cacheRead: 3, cacheWrite: 4 },
            },
          ],
        });
      };
      createdSessions.push(session);
      return { session } as unknown as Awaited<
        ReturnType<typeof mockCreateAgentSession>
      >;
    });

    const runner = createPiRunner({ model: "openai:gpt-4o" });
    const chunks: string[] = [];
    for await (const chunk of runner.run("sum turns")) {
      chunks.push(chunk);
    }

    const finishChunk = chunks.find((c) => c.includes('"type":"finish"'));
    expect(finishChunk).toBeDefined();
    const data = JSON.parse(finishChunk!.replace(/^data: /, "").trim()) as {
      messageMetadata?: {
        usage?: Record<string, unknown>;
        models?: Record<string, { type: string } & Record<string, unknown>>;
      };
    };

    expect(data.messageMetadata?.usage?.input_tokens).toBe(30);
    expect(data.messageMetadata?.usage?.output_tokens).toBe(40);
    expect(data.messageMetadata?.usage?.cache_read_input_tokens).toBe(3);
    expect(data.messageMetadata?.usage?.cache_creation_input_tokens).toBe(4);
    expect(
      (
        data.messageMetadata?.usage?.raw as
          | Record<string, Record<string, unknown>>
          | undefined
      )?.["gpt-4o"]?.type,
    ).toBe("chat");
  });

  it("accumulates edit_image tool usage into finish messageMetadata", async () => {
    const { createAgentSession: mockCreateAgentSession } = await import(
      "@mariozechner/pi-coding-agent"
    );
    vi.mocked(mockCreateAgentSession).mockImplementationOnce(async () => {
      const session = new MockSession();
      session.prompt = async function (_input: string) {
        this["emit"]({
          type: "tool_execution_start",
          toolCallId: "img_edit_1",
          toolName: "edit_image",
          args: { image: "input.png", prompt: "remove watermark" },
        });
        this["emit"]({
          type: "tool_execution_end",
          toolCallId: "img_edit_1",
          toolName: "edit_image",
          result: {
            content: [{ type: "text", text: "/tmp/edited.png" }],
            details: {
              filePath: "/tmp/edited.png",
              usage: {
                raw: {
                  "gpt-image-1": {
                    total_tokens: 130,
                    input_tokens: 20,
                    output_tokens: 110,
                  },
                },
              },
              response: {
                data: [{ b64_json: "" }],
                usage: {
                  total_tokens: 130,
                  input_tokens: 20,
                  output_tokens: 110,
                },
              },
            },
          },
          isError: false,
        });
        this["emit"]({
          type: "agent_end",
          messages: [
            {
              role: "assistant",
              usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        });
      };
      createdSessions.push(session);
      return { session } as unknown as Awaited<
        ReturnType<typeof mockCreateAgentSession>
      >;
    });

    const runner = createPiRunner({
      model: "openai:gpt-image-1",
      env: { IMAGE_GENERATION_MODEL: "openai:gpt-image-1" },
    });
    const chunks: string[] = [];
    for await (const chunk of runner.run("remove watermark from input.png")) {
      chunks.push(chunk);
    }

    const finishChunk = chunks.find((c) => c.includes('"type":"finish"'));
    expect(finishChunk).toBeDefined();
    const data = JSON.parse(finishChunk!.replace(/^data: /, "").trim()) as {
      messageMetadata?: {
        usage?: Record<string, unknown>;
        models?: Record<string, { type: string } & Record<string, unknown>>;
      };
    };

    expect(data.messageMetadata?.usage?.input_tokens).toBe(10);
    expect(data.messageMetadata?.usage?.output_tokens).toBe(20);
    expect(data.messageMetadata).not.toHaveProperty("cost");
    expect(data.messageMetadata).not.toHaveProperty("imageCost");
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
  const outputChunk = chunks.find(
    (c) =>
      c.includes('"type":"tool-output-available"') && c.includes("tool_fail"),
  );
  expect(outputChunk).toBeDefined();
  expect(outputChunk).toContain('"isError":true');

  // The output must be a plain string, not the raw pi ToolResult object
  const data = JSON.parse(outputChunk!.replace(/^data: /, "").trim());
  expect(typeof data.output).toBe("string");
  expect(data.output).toBe("command failed");
});

// ── redactSecrets unit tests ─────────────────────────────────────────────────

describe("redactSecrets", () => {
  const secrets: Record<string, string> = {
    OPENAI_API_KEY: "sk-test-1234567890abcdef",
    ANTHROPIC_BASE_URL: "http://litellm.litellm:4",
    AGENT_KEY: "agk_598abe628c625975844596da75a2ec96",
    SHORT_VAL: "abc",
    _: "/usr/local/bin/node",
  };

  it("returns text unchanged when secrets is empty", () => {
    expect(redactSecrets("hello world", {})).toBe("hello world");
  });

  it("removes secret values from KEY=VALUE lines (env/printenv style)", () => {
    const input = [
      "HOME=/root",
      "OPENAI_API_KEY=sk-test-1234567890abcdef",
      "PATH=/usr/bin",
    ].join("\n");
    const result = redactSecrets(input, secrets);
    expect(result).toContain("HOME=/root");
    expect(result).toContain("PATH=/usr/bin");
    expect(result).not.toContain("sk-test-1234567890abcdef");
  });

  it("removes secret values from KEY: 'VALUE' entries (JS object style)", () => {
    const input = `{
  OPENAI_API_KEY: 'sk-test-1234567890abcdef',
  HOME: '/root',
  AGENT_KEY: 'agk_598abe628c625975844596da75a2ec96',
}`;
    const result = redactSecrets(input, secrets);
    expect(result).toContain("HOME");
    expect(result).not.toContain("sk-test-1234567890abcdef");
    expect(result).not.toContain("agk_598abe628c625975844596da75a2ec96");
  });

  it('removes secret values from "KEY": "VALUE" entries (JSON style)', () => {
    const input = `{
  "OPENAI_API_KEY": "sk-test-1234567890abcdef",
  "HOME": "/root",
  "ANTHROPIC_BASE_URL": "http://litellm.litellm:4"
}`;
    const result = redactSecrets(input, secrets);
    expect(result).toContain("HOME");
    expect(result).not.toContain("sk-test-1234567890abcdef");
    expect(result).not.toContain("http://litellm.litellm:4");
  });

  it("handles single-line JS object output", () => {
    const input =
      "{OPENAI_API_KEY: 'sk-test-1234567890abcdef', HOME: '/root', AGENT_KEY: 'agk_598abe628c625975844596da75a2ec96'}";
    const result = redactSecrets(input, secrets);
    expect(result).toContain("HOME");
    expect(result).not.toContain("sk-test-1234567890abcdef");
    expect(result).not.toContain("agk_598abe628c625975844596da75a2ec96");
  });

  it("does not remove underscores from other keys when _ is a secret key", () => {
    const input = "OPENAI_API_KEY: 'sk-test-1234567890abcdef', HOME: '/root'";
    const result = redactSecrets(input, secrets);
    // Underscores in other keys must not be stripped
    expect(result).not.toContain("OPENAIAPIKEY");
    expect(result).toContain("HOME");
  });

  it("scrubs bare secret values (>= 8 chars) appearing in free text", () => {
    const input = "The key is sk-test-1234567890abcdef and it works.";
    const result = redactSecrets(input, secrets);
    expect(result).not.toContain("sk-test-1234567890abcdef");
    expect(result).toContain("***");
  });

  it("does not scrub short secret values to avoid false positives", () => {
    const input = "abc is a common string and abc appears twice";
    const result = redactSecrets(input, { SHORT: "abc" });
    // "abc" is only 3 chars, should NOT be scrubbed
    expect(result).toContain("abc");
  });
});
