import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import {
  applyExternalToolMarkerFilter,
  buildExternalToolsSection,
  EXTERNAL_TOOL_CALL_MARKER,
  EXTERNAL_TOOL_RESULT_MARKER,
  parseExternalToolCallMarker,
  resolveRequestAllowedTools,
} from "../provider/bunny-agent-language-model";

// ─── resolveRequestAllowedTools ──────────────────────────────────────────────

describe("resolveRequestAllowedTools", () => {
  it("uses defaults when streamText tools are not provided", () => {
    const allowedTools = resolveRequestAllowedTools(
      { prompt: [] } as LanguageModelV3CallOptions,
      ["bash", "read"],
    );

    expect(allowedTools).toEqual(["bash", "read"]);
  });

  it("uses streamText tool names when provided", () => {
    const allowedTools = resolveRequestAllowedTools(
      {
        prompt: [],
        tools: [
          {
            type: "function",
            name: "custom_tool",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      } as LanguageModelV3CallOptions,
      ["bash"],
    );

    expect(allowedTools).toEqual(["custom_tool"]);
  });

  it("deduplicates and trims tool names from streamText tools", () => {
    const allowedTools = resolveRequestAllowedTools(
      {
        prompt: [],
        tools: [
          {
            type: "function",
            name: "  bash  ",
            inputSchema: { type: "object", properties: {} },
          },
          {
            type: "provider",
            id: "bunny.read",
            name: "read",
            args: {},
          },
          {
            type: "function",
            name: "bash",
            inputSchema: { type: "object", properties: {} },
          },
          {
            type: "function",
            name: "   ",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      } as LanguageModelV3CallOptions,
      undefined,
    );

    expect(allowedTools).toEqual(["bash", "read"]);
  });

  it("returns an empty list when streamText tools is explicitly empty", () => {
    const allowedTools = resolveRequestAllowedTools(
      { prompt: [], tools: [] } as LanguageModelV3CallOptions,
      ["bash"],
    );

    expect(allowedTools).toEqual([]);
  });
});

// ─── parseExternalToolCallMarker ─────────────────────────────────────────────

describe("parseExternalToolCallMarker", () => {
  it("parses a valid marker line", () => {
    const result = parseExternalToolCallMarker(
      `${EXTERNAL_TOOL_CALL_MARKER} {"id":"abc123","name":"myTool","args":{"q":"hello"}}`,
    );
    expect(result).toEqual({ id: "abc123", name: "myTool", args: { q: "hello" } });
  });

  it("generates an id when it is missing from the marker", () => {
    const result = parseExternalToolCallMarker(
      `${EXTERNAL_TOOL_CALL_MARKER} {"name":"noId","args":{}}`,
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("noId");
    expect(typeof result?.id).toBe("string");
    expect(result?.id.length).toBeGreaterThan(0);
  });

  it("returns null for a non-marker line", () => {
    expect(parseExternalToolCallMarker("Just some text output")).toBeNull();
  });

  it("returns null for malformed JSON in a marker line", () => {
    expect(
      parseExternalToolCallMarker(`${EXTERNAL_TOOL_CALL_MARKER} not-json`),
    ).toBeNull();
  });

  it("returns null when the parsed object is missing required fields", () => {
    expect(
      parseExternalToolCallMarker(
        `${EXTERNAL_TOOL_CALL_MARKER} {"id":"x","name":"t"}`,
      ),
    ).toBeNull();
  });

  it("handles leading/trailing whitespace around the marker prefix", () => {
    const result = parseExternalToolCallMarker(
      `   ${EXTERNAL_TOOL_CALL_MARKER} {"id":"w","name":"padded","args":{}}   `,
    );
    expect(result?.name).toBe("padded");
  });
});

// ─── buildExternalToolsSection ───────────────────────────────────────────────

describe("buildExternalToolsSection", () => {
  it("returns an empty string when there are no tools", () => {
    expect(buildExternalToolsSection([])).toBe("");
  });

  it("includes the tool name and description", () => {
    const section = buildExternalToolsSection([
      {
        type: "function",
        name: "searchDB",
        description: "Search the database",
        inputSchema: { type: "object" as const, properties: { q: { type: "string" } } },
      },
    ]);
    expect(section).toContain("searchDB");
    expect(section).toContain("Search the database");
    expect(section).toContain(EXTERNAL_TOOL_CALL_MARKER);
    expect(section).toContain(EXTERNAL_TOOL_RESULT_MARKER);
  });

  it("includes all tool names when multiple tools are provided", () => {
    const section = buildExternalToolsSection([
      {
        type: "function",
        name: "toolA",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        type: "function",
        name: "toolB",
        description: "Does B",
        inputSchema: { type: "object" as const, properties: {} },
      },
    ]);
    expect(section).toContain("toolA");
    expect(section).toContain("toolB");
  });

  it("uses a placeholder when description is absent", () => {
    const section = buildExternalToolsSection([
      {
        type: "function",
        name: "noDesc",
        inputSchema: { type: "object" as const, properties: {} },
      },
    ]);
    expect(section).toContain("(no description)");
  });
});

// ─── applyExternalToolMarkerFilter ───────────────────────────────────────────

async function collectStream(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<LanguageModelV3StreamPart[]> {
  const reader = stream.getReader();
  const parts: LanguageModelV3StreamPart[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

function makePart(type: string, extra: Record<string, unknown> = {}): LanguageModelV3StreamPart {
  return { type, ...extra } as unknown as LanguageModelV3StreamPart;
}

function makeStream(
  parts: LanguageModelV3StreamPart[],
): ReadableStream<LanguageModelV3StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(p);
      controller.close();
    },
  });
}

describe("applyExternalToolMarkerFilter", () => {
  it("passes through the stream unchanged when externalToolNames is empty", async () => {
    const parts = [makePart("text-start", { id: "1" }), makePart("text-delta", { id: "1", delta: "hello" }), makePart("text-end", { id: "1" })];
    const out = await collectStream(applyExternalToolMarkerFilter(makeStream(parts), new Set()));
    expect(out).toEqual(parts);
  });

  it("converts a marker line to a tool-call event and strips it from text", async () => {
    const marker = `${EXTERNAL_TOOL_CALL_MARKER} {"id":"c1","name":"myTool","args":{"x":1}}\n`;
    const parts: LanguageModelV3StreamPart[] = [
      makePart("text-start", { id: "t1" }),
      makePart("text-delta", { id: "t1", delta: "before\n" }),
      makePart("text-delta", { id: "t1", delta: marker }),
      makePart("text-delta", { id: "t1", delta: "after\n" }),
      makePart("text-end", { id: "t1" }),
    ];
    const out = await collectStream(
      applyExternalToolMarkerFilter(makeStream(parts), new Set(["myTool"])),
    );

    const toolCalls = out.filter((p) => p.type === "tool-call");
    expect(toolCalls).toHaveLength(1);
    expect((toolCalls[0] as { toolCallId: string; toolName: string; input: string }).toolCallId).toBe("c1");
    expect((toolCalls[0] as { toolName: string }).toolName).toBe("myTool");
    expect(JSON.parse((toolCalls[0] as { input: string }).input)).toEqual({ x: 1 });

    const textDeltas = out.filter((p) => p.type === "text-delta").map((p) => (p as { delta: string }).delta);
    const combinedText = textDeltas.join("");
    expect(combinedText).toContain("before");
    expect(combinedText).toContain("after");
    expect(combinedText).not.toContain(EXTERNAL_TOOL_CALL_MARKER);
  });

  it("does not intercept a marker for a tool name NOT in externalToolNames", async () => {
    const marker = `${EXTERNAL_TOOL_CALL_MARKER} {"id":"c2","name":"unknownTool","args":{}}\n`;
    const parts: LanguageModelV3StreamPart[] = [
      makePart("text-start", { id: "t2" }),
      makePart("text-delta", { id: "t2", delta: marker }),
      makePart("text-end", { id: "t2" }),
    ];
    const out = await collectStream(
      applyExternalToolMarkerFilter(makeStream(parts), new Set(["otherTool"])),
    );

    expect(out.filter((p) => p.type === "tool-call")).toHaveLength(0);
    const textDeltas = out.filter((p) => p.type === "text-delta").map((p) => (p as { delta: string }).delta).join("");
    expect(textDeltas).toContain(EXTERNAL_TOOL_CALL_MARKER);
  });

  it("passes non-text stream parts through unchanged", async () => {
    const finishPart = makePart("finish", { finishReason: { unified: "stop", raw: "stop" }, usage: {}, providerMetadata: undefined });
    const parts: LanguageModelV3StreamPart[] = [finishPart];
    const out = await collectStream(
      applyExternalToolMarkerFilter(makeStream(parts), new Set(["myTool"])),
    );
    expect(out).toEqual([finishPart]);
  });

  it("handles a marker that spans the last incomplete line at text-end", async () => {
    // No trailing newline — the line ends at text-end
    const marker = `${EXTERNAL_TOOL_CALL_MARKER} {"id":"c3","name":"myTool","args":{}}`;
    const parts: LanguageModelV3StreamPart[] = [
      makePart("text-start", { id: "t3" }),
      makePart("text-delta", { id: "t3", delta: marker }),
      makePart("text-end", { id: "t3" }),
    ];
    const out = await collectStream(
      applyExternalToolMarkerFilter(makeStream(parts), new Set(["myTool"])),
    );
    const toolCalls = out.filter((p) => p.type === "tool-call");
    expect(toolCalls).toHaveLength(1);
    expect((toolCalls[0] as { toolName: string }).toolName).toBe("myTool");
  });
});
