import { describe, expect, it } from "vitest";
import { jsonSchema, tool } from "ai";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import {
  compileToolRefsForBunny,
  streamText,
  toDynamicToolSetForBunny,
} from "../provider/stream-text";

describe("Bunny streamText tools", () => {
  it("compiles AI SDK execute tools into pending gateway runtime tools", async () => {
    let executedInput: unknown;
    const compiled = await compileToolRefsForBunny({
      lookupUser: tool({
        description: "Look up a user",
        inputSchema: jsonSchema({
          type: "object",
          properties: { userId: { type: "string" } },
          required: ["userId"],
        }),
        async execute(input) {
          executedInput = input;
          return { ok: true };
        },
      }),
    });
    expect(compiled?.pendingTools?.tools).toHaveLength(1);
    expect(compiled?.toolRefs[0]).toMatchObject({
      name: "lookupUser",
      description: "Look up a user",
      runtime: {
        type: "gateway",
        bridge: { transport: "http", url: "pending://gateway", token: "" },
      },
    });

    compiled?.pendingTools?.attachBridge({
      transport: "http",
      url: "https://example.com/tools",
      token: "tok",
    });
    expect(compiled?.toolRefs[0].runtime).toEqual({
      type: "gateway",
      bridge: {
        transport: "http",
        url: "https://example.com/tools",
        token: "tok",
      },
    });

    const result = await compiled?.pendingTools?.tools[0].execute(
      { userId: "u_123" },
      { signal: new AbortController().signal },
    );
    expect(result).toEqual({ ok: true });
    expect(executedInput).toEqual({ userId: "u_123" });
  });

  it("marks AI SDK tools as dynamic for UI stream rendering", () => {
    const tools = toDynamicToolSetForBunny({
      compute_word_count: tool({
        description: "Count words",
        inputSchema: jsonSchema({
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        }),
        async execute() {
          return { wordCount: 3 };
        },
      }),
    });

    expect(tools.compute_word_count.type).toBe("dynamic");
  });

  it("keeps provider-executed runner tools dynamic in UI streams", async () => {
    const model = createMockBunnyModel([
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
        compute_word_count: tool({
          description: "Count words",
          inputSchema: jsonSchema({
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          }),
          async execute() {
            return { wordCount: 2 };
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
        providerExecuted: true,
        dynamic: true,
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
});

function createMockBunnyModel(parts: LanguageModelV3StreamPart[]): LanguageModelV3 & {
  settings: Record<string, unknown>;
} {
  return {
    specificationVersion: "v3",
    provider: "bunny-agent",
    modelId: "mock",
    supportedUrls: {},
    settings: {},
    async doStream(_options: LanguageModelV3CallOptions) {
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
