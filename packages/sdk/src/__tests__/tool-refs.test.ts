import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import type {
  BunnyAgentCodingRunBody,
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@bunny-agent/manager";
import { jsonSchema, streamText } from "ai";
import { describe, expect, it } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";
import {
  bunnyHttpTool,
  bunnySandboxTool,
  compileToolRefsFromLanguageModelTools,
} from "../provider/tool-refs";

describe("Bunny provider tool refs", () => {
  it("stores direct HTTP runtime metadata in AI SDK providerOptions", async () => {
    const model = createCapturingModel();

    const result = streamText({
      model,
      messages: [{ role: "user", content: "weather" }],
      tools: {
        weather: bunnyHttpTool({
          description: "Get weather",
          inputSchema: jsonSchema({
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          }),
          endpoint: {
            url: "https://example.com/weather",
            headers: { Authorization: "Bearer token" },
          },
        }),
      },
    });

    await result.consumeStream();

    expect(model.lastOptions?.tools?.[0]).toMatchObject({
      type: "function",
      name: "weather",
      providerOptions: {
        "bunny-agent": {
          runtime: {
            type: "http",
            url: "https://example.com/weather",
            headers: { Authorization: "Bearer token" },
          },
        },
      },
    });
  });

  it("stores sandbox module runtime metadata in AI SDK providerOptions", async () => {
    const model = createCapturingModel();

    const result = streamText({
      model,
      messages: [{ role: "user", content: "repo stats" }],
      tools: {
        repoStats: bunnySandboxTool({
          description: "Repo stats",
          inputSchema: jsonSchema({
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          }),
          module: "/workspace/tools/repo-stats.mjs",
          exportName: "run",
        }),
      },
    });

    await result.consumeStream();

    expect(model.lastOptions?.tools?.[0]).toMatchObject({
      type: "function",
      name: "repoStats",
      providerOptions: {
        "bunny-agent": {
          runtime: {
            type: "module",
            module: "/workspace/tools/repo-stats.mjs",
            exportName: "run",
          },
        },
      },
    });
  });

  it("compiles direct HTTP runtime metadata from provider tools", () => {
    const toolRefs = compileToolRefsFromLanguageModelTools([
      {
        type: "function",
        name: "weather",
        description: "Get weather",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
        providerOptions: {
          "bunny-agent": {
            runtime: {
              type: "http",
              url: "https://example.com/weather",
              headers: { Authorization: "Bearer token" },
            },
          },
        },
      },
    ]);

    expect(toolRefs).toEqual([
      {
        name: "weather",
        description: "Get weather",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
        runtime: {
          type: "http",
          url: "https://example.com/weather",
          headers: { Authorization: "Bearer token" },
        },
      },
    ]);
  });

  it("rejects ordinary AI SDK execute tools without a Bunny-visible runtime", () => {
    expect(() =>
      compileToolRefsFromLanguageModelTools([
        {
          type: "function",
          name: "lookupUser",
          description: "Look up a user",
          inputSchema: {
            type: "object",
            properties: { userId: { type: "string" } },
            required: ["userId"],
          },
        },
      ]),
    ).toThrow(
      "Bunny cannot access host-side tool({ execute }) callbacks at the provider boundary",
    );
  });

  it("passes provider-executed runner tools through UI streams with standard AI SDK streamText", async () => {
    const model = createMockModel([
      {
        type: "tool-input-start",
        id: "tool-call-1",
        toolName: "compute_word_count",
        providerExecuted: true,
        dynamic: true,
      },
      {
        type: "tool-call",
        toolCallId: "tool-call-1",
        toolName: "compute_word_count",
        input: JSON.stringify({ text: "hello world" }),
        providerExecuted: true,
        dynamic: true,
      },
      {
        type: "tool-result",
        toolCallId: "tool-call-1",
        toolName: "compute_word_count",
        result: { wordCount: 2 },
        dynamic: true,
      },
      {
        type: "finish",
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: undefined, reasoning: undefined },
        },
      },
    ]);

    const result = streamText({
      model,
      messages: [{ role: "user", content: "count words" }],
      tools: {
        compute_word_count: bunnyHttpTool({
          description: "Count words",
          inputSchema: jsonSchema({
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          }),
          endpoint: {
            url: "https://example.com/tools/compute_word_count",
          },
        }),
      },
    });

    const uiChunks = [];
    for await (const chunk of result.toUIMessageStream()) {
      uiChunks.push(chunk);
    }

    expect(uiChunks).toContainEqual(
      expect.objectContaining({
        type: "tool-input-start",
        toolCallId: "tool-call-1",
        toolName: "compute_word_count",
        dynamic: true,
        providerExecuted: true,
      }),
    );
    expect(uiChunks).toContainEqual(
      expect.objectContaining({
        type: "tool-input-available",
        toolCallId: "tool-call-1",
        toolName: "compute_word_count",
        dynamic: true,
      }),
    );
    expect(uiChunks).toContainEqual(
      expect.objectContaining({
        type: "tool-output-available",
        toolCallId: "tool-call-1",
        dynamic: true,
      }),
    );
  });

  it("treats provider-executed runner tool SSE events as dynamic when dynamic is omitted", async () => {
    const model = createMockModel([
      {
        type: "tool-input-start",
        id: "tool-call-1",
        toolName: "compute_word_count",
        providerExecuted: true,
      } as LanguageModelV3StreamPart,
      {
        type: "tool-call",
        toolCallId: "tool-call-1",
        toolName: "compute_word_count",
        input: JSON.stringify({ text: "hello world" }),
        providerExecuted: true,
      } as LanguageModelV3StreamPart,
      {
        type: "tool-result",
        toolCallId: "tool-call-1",
        toolName: "compute_word_count",
        result: { wordCount: 2 },
      } as LanguageModelV3StreamPart,
      {
        type: "finish",
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: undefined, reasoning: undefined },
        },
      },
    ]);

    const result = streamText({
      model,
      messages: [{ role: "user", content: "count words" }],
      tools: {
        compute_word_count: bunnyHttpTool({
          description: "Count words",
          inputSchema: jsonSchema({
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          }),
          endpoint: {
            url: "https://example.com/tools/compute_word_count",
          },
        }),
      },
    });

    const uiChunks = [];
    for await (const chunk of result.toUIMessageStream()) {
      uiChunks.push(chunk);
    }

    expect(uiChunks).toContainEqual(
      expect.objectContaining({
        type: "tool-input-start",
        toolCallId: "tool-call-1",
        toolName: "compute_word_count",
        dynamic: true,
        providerExecuted: true,
      }),
    );
    expect(uiChunks).toContainEqual(
      expect.objectContaining({
        type: "tool-input-available",
        toolCallId: "tool-call-1",
        toolName: "compute_word_count",
        dynamic: true,
      }),
    );
    expect(uiChunks).toContainEqual(
      expect.objectContaining({
        type: "tool-output-available",
        toolCallId: "tool-call-1",
        dynamic: true,
      }),
    );
  });

  it("sends AI SDK tools as toolRefs without mutating runner allowedTools", async () => {
    const capturedBodies: BunnyAgentCodingRunBody[] = [];
    const sandbox = createCodingRunSandbox(capturedBodies);
    const bunnyAgent = createBunnyAgent({
      sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      allowedTools: ["read", "bash"],
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      messages: [{ role: "user", content: "create one" }],
      tools: {
        create_automation: bunnyHttpTool({
          description: "Create automation",
          inputSchema: jsonSchema({
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          }),
          endpoint: {
            url: "https://example.com/tools/create_automation",
          },
        }),
      },
    });

    await result.consumeStream();

    expect(capturedBodies[0]).toMatchObject({
      allowedTools: ["read", "bash"],
      toolRefs: [
        expect.objectContaining({
          name: "create_automation",
        }),
      ],
    });
  });

  it("forwards forkFrom into the daemon coding-run body", async () => {
    const capturedBodies: BunnyAgentCodingRunBody[] = [];
    const sandbox = createCodingRunSandbox(capturedBodies);
    const bunnyAgent = createBunnyAgent({
      sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      forkFrom: "sess_source_abc",
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      messages: [{ role: "user", content: "continue from shared" }],
    });

    await result.consumeStream();

    expect(capturedBodies[0]).toMatchObject({
      forkFrom: "sess_source_abc",
    });
  });

  it("defaults hosted Pi runs to bypass regular tool approvals", async () => {
    const capturedBodies: BunnyAgentCodingRunBody[] = [];
    const sandbox = createCodingRunSandbox(capturedBodies);
    const bunnyAgent = createBunnyAgent({
      sandbox,
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      messages: [{ role: "user", content: "write a file" }],
    });

    await result.consumeStream();

    expect(capturedBodies[0]).toMatchObject({ yolo: true });
  });

  it("preserves explicit Pi approval mode for capable hosts", async () => {
    const capturedBodies: BunnyAgentCodingRunBody[] = [];
    const sandbox = createCodingRunSandbox(capturedBodies);
    const bunnyAgent = createBunnyAgent({
      sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      yolo: false,
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      messages: [{ role: "user", content: "ask before writing" }],
    });

    await result.consumeStream();

    expect(capturedBodies[0]).toMatchObject({ yolo: false });
  });

  it("forwards request-scoped MCP config into the daemon body", async () => {
    const capturedBodies: BunnyAgentCodingRunBody[] = [];
    const sandbox = createCodingRunSandbox(capturedBodies);
    const mcpConfig = {
      mcpServers: {
        remote: {
          url: "https://mcp.example.com",
          auth: "bearer" as const,
          bearerToken: "secret",
        },
      },
    };
    const bunnyAgent = createBunnyAgent({
      sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      runnerType: "pi",
      mcpConfig,
    });

    const result = streamText({
      model: bunnyAgent("openai:gpt-5"),
      messages: [{ role: "user", content: "use mcp" }],
    });

    await result.consumeStream();

    expect(capturedBodies[0]).toMatchObject({ mcpConfig });
  });

  it("forwards request-scoped MCP config through the CLI one-shot payload", async () => {
    const capturedExecs: Array<{
      command: string[];
      options?: ExecOptions;
    }> = [];
    const sandbox = createExecSandbox(capturedExecs);
    const bunnyAgent = createBunnyAgent({
      sandbox,
      runnerType: "pi",
      mcpConfig: {
        mcpServers: {
          remote: {
            url: "https://mcp.example.com",
            auth: "bearer",
            bearerToken: "cli-secret",
          },
        },
      },
    });

    const result = streamText({
      model: bunnyAgent("openai:gpt-5"),
      messages: [{ role: "user", content: "use mcp" }],
    });

    await result.consumeStream();

    const payload = JSON.parse(
      capturedExecs[0].options?.env?.BUNNY_AGENT_MCP_CONFIG_JSON ?? "{}",
    );
    expect(payload).toMatchObject({
      config: {
        mcpServers: {
          remote: { bearerToken: "cli-secret" },
        },
      },
    });
    expect(capturedExecs[0].command.join(" ")).not.toContain("cli-secret");
  });

  it("applies changed MCP config to the next fresh or resumed turn", async () => {
    const capturedBodies: BunnyAgentCodingRunBody[] = [];
    const sandbox = createCodingRunSandbox(capturedBodies);
    const bunnyAgent = createBunnyAgent({
      sandbox,
      daemonUrl: "http://127.0.0.1:3080",
      runnerType: "pi",
    });

    const first = streamText({
      model: bunnyAgent("openai:gpt-5", {
        mcpConfig: {
          mcpServers: {
            first: { url: "https://first.example.com" },
          },
        },
      }),
      messages: [{ role: "user", content: "fresh turn" }],
    });
    await first.consumeStream();

    const second = streamText({
      model: bunnyAgent("openai:gpt-5", {
        resume: "sess_previous",
        mcpConfig: {
          mcpServers: {
            second: { url: "https://second.example.com" },
          },
        },
      }),
      messages: [{ role: "user", content: "resumed turn" }],
    });
    await second.consumeStream();

    expect(capturedBodies).toHaveLength(2);
    expect(capturedBodies[0]).toMatchObject({
      mcpConfig: {
        mcpServers: {
          first: { url: "https://first.example.com" },
        },
      },
    });
    expect(capturedBodies[0].resume).toBeUndefined();
    expect(capturedBodies[1]).toMatchObject({
      resume: "sess_previous",
      mcpConfig: {
        mcpServers: {
          second: { url: "https://second.example.com" },
        },
      },
    });
    expect(capturedBodies[1].mcpConfig?.mcpServers).not.toHaveProperty("first");
  });
});

function createCodingRunSandbox(
  capturedBodies: BunnyAgentCodingRunBody[],
): SandboxAdapter {
  const handle: SandboxHandle = {
    getSandboxId: () => null,
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec: async function* () {},
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
    streamCodingRun: async function* (
      body: BunnyAgentCodingRunBody,
      _opts?: ExecOptions,
    ) {
      capturedBodies.push(body);
      yield new TextEncoder().encode(
        'data: {"type":"finish","finishReason":{"unified":"stop","raw":"stop"},"usage":{"inputTokens":{"total":0,"noCache":0,"cacheRead":0,"cacheWrite":0},"outputTokens":{"total":0}}}\n\n',
      );
      yield new TextEncoder().encode("data: [DONE]\n\n");
    },
  };

  return {
    attach: async () => handle,
    getHandle: () => handle,
    getWorkdir: () => "/workspace",
  };
}

function createExecSandbox(
  capturedExecs: Array<{ command: string[]; options?: ExecOptions }>,
): SandboxAdapter {
  const handle: SandboxHandle = {
    getSandboxId: () => null,
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec: async function* (command: string[], options?: ExecOptions) {
      capturedExecs.push({ command, options });
      yield new TextEncoder().encode(
        'data: {"type":"finish","finishReason":{"unified":"stop","raw":"stop"},"usage":{"inputTokens":{"total":0,"noCache":0,"cacheRead":0,"cacheWrite":0},"outputTokens":{"total":0}}}\n\n',
      );
      yield new TextEncoder().encode("data: [DONE]\n\n");
    },
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
  };

  return {
    attach: async () => handle,
    getHandle: () => handle,
    getWorkdir: () => "/workspace",
  };
}

function createCapturingModel(): LanguageModelV3 & {
  lastOptions?: LanguageModelV3CallOptions;
} {
  const model = createMockModel([
    {
      type: "finish",
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: undefined, reasoning: undefined },
      },
    },
  ]) as LanguageModelV3 & { lastOptions?: LanguageModelV3CallOptions };
  return model;
}

function createMockModel(
  parts: LanguageModelV3StreamPart[],
): LanguageModelV3 & {
  lastOptions?: LanguageModelV3CallOptions;
} {
  return {
    specificationVersion: "v3",
    provider: "bunny-agent",
    modelId: "mock",
    supportedUrls: {},
    async doStream(options: LanguageModelV3CallOptions) {
      this.lastOptions = options;
      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
    async doGenerate() {
      throw new Error("not implemented");
    },
  };
}
