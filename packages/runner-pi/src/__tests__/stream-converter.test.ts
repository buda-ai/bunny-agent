import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { PiAISDKStreamConverter } from "../stream-converter.js";

function makeConverter(searchContractVersion?: 1) {
  return new PiAISDKStreamConverter({
    searchContractVersion,
    sessionId: "sess",
    model: { id: "gpt-5.4", provider: "openai" },
    normalizeToolOutput: (r) => JSON.stringify(r),
    getUsageFromAgentEndMessages: () => undefined,
    getErrorFromAgentEndMessages: () => undefined,
  });
}

function textStart(): AgentSessionEvent {
  return {
    type: "message_update",
    // biome-ignore lint/suspicious/noExplicitAny: shape validated by runtime, partial for test
    message: {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: shape validated by runtime, partial for test
    assistantMessageEvent: { type: "text_start" } as any,
  } as AgentSessionEvent;
}

function textDelta(delta: string): AgentSessionEvent {
  return {
    type: "message_update",
    // biome-ignore lint/suspicious/noExplicitAny: shape validated by runtime, partial for test
    message: {} as any,
    // biome-ignore lint/suspicious/noExplicitAny: shape validated by runtime, partial for test
    assistantMessageEvent: { type: "text_delta", delta } as any,
  } as AgentSessionEvent;
}

function deltasOf(chunks: string[]): string[] {
  return chunks
    .map((c) => c.replace(/^data: /, "").replace(/\n\n$/, ""))
    .filter((s) => s && s !== "[DONE]")
    .map((s) => {
      try {
        return JSON.parse(s) as { type: string; delta?: string };
      } catch {
        return { type: "unparseable" };
      }
    })
    .filter((e) => e.type === "text-delta")
    .map((e) => e.delta ?? "");
}

function eventsOf(chunks: string[]): Array<Record<string, unknown>> {
  return chunks
    .map((chunk) => chunk.replace(/^data: /, "").replace(/\n\n$/, ""))
    .filter((line) => line && line !== "[DONE]")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("PiAISDKStreamConverter text-delta passthrough", () => {
  it("preserves leading/trailing newlines in a single delta", () => {
    const conv = makeConverter();
    conv.handleEvent(textStart(), false);
    const chunks = conv.handleEvent(textDelta("\n\n### Heading\n\n"), false);
    expect(deltasOf(chunks)).toEqual(["\n\n### Heading\n\n"]);
  });

  it("preserves markdown separators across fragmented GPT-style deltas", () => {
    // Reproduces the real trace: GPT streams "。" / "\n\n---\n\n" / "## " / "先说" separately.
    // Before the fix, redactSecrets().trim() stripped the newlines, giving "。---##先说".
    const conv = makeConverter();
    conv.handleEvent(textStart(), false);
    const fragments = ["。", "\n\n---\n\n", "## ", "先说"];
    const deltas: string[] = [];
    for (const delta of fragments) {
      const chunks = conv.handleEvent(textDelta(delta), false);
      deltas.push(...deltasOf(chunks));
    }
    expect(deltas.join("")).toBe("。\n\n---\n\n## 先说");
  });
});

describe("PiAISDKStreamConverter finish reason", () => {
  it("preserves length termination after partial text", () => {
    const conv = makeConverter();
    conv.handleEvent(textStart(), false);
    conv.handleEvent(textDelta("Partial response"), false);

    const chunks = conv.handleEvent(
      {
        type: "agent_end",
        messages: [
          {
            role: "assistant",
            stopReason: "length",
          },
        ],
      } as AgentSessionEvent,
      false,
    );
    const events = eventsOf(chunks);

    expect(events.map((event) => event.type)).toEqual(["text-end", "finish"]);
    expect(events[1]).toEqual({
      type: "finish",
      finishReason: "length",
      messageMetadata: { providerStopReason: "length" },
    });
    expect(chunks).toContain("data: [DONE]\n\n");
  });

  it("keeps normal assistant termination as stop", () => {
    const conv = makeConverter();
    const chunks = conv.handleEvent(
      {
        type: "agent_end",
        messages: [{ role: "assistant", stopReason: "stop" }],
      } as AgentSessionEvent,
      false,
    );

    expect(eventsOf(chunks)).toContainEqual({
      type: "finish",
      finishReason: "stop",
      messageMetadata: { providerStopReason: "stop" },
    });
  });
});

describe("PiAISDKStreamConverter tool output", () => {
  it("emits structured answers for ask-user-question results", () => {
    const conv = makeConverter();
    const chunks = conv.handleEvent(
      {
        type: "tool_execution_end",
        toolCallId: "tool-1",
        toolName: "ask_user_question",
        result: {
          content: [{ type: "text", text: "The user answered." }],
          details: {
            questions: [{ question: "What would you like to create?" }],
            answers: { "What would you like to create?": "Make a video" },
          },
        },
        isError: false,
      } as AgentSessionEvent,
      false,
    );

    expect(eventsOf(chunks)).toContainEqual(
      expect.objectContaining({
        type: "tool-output-available",
        toolCallId: "tool-1",
        output: {
          answers: { "What would you like to create?": "Make a video" },
        },
      }),
    );
  });

  it("does not persist the internal timeout marker as a user answer", () => {
    const conv = makeConverter();
    const chunks = conv.handleEvent(
      {
        type: "tool_execution_end",
        toolCallId: "tool-2",
        toolName: "AskUserQuestion",
        result: {
          details: {
            answers: {
              "Known question": "Known answer",
              __bunny_agent_timeout__: "Timed out",
            },
          },
        },
        isError: false,
      } as AgentSessionEvent,
      false,
    );

    expect(eventsOf(chunks)).toContainEqual(
      expect.objectContaining({
        output: { answers: { "Known question": "Known answer" } },
      }),
    );
  });

  const validWebSearchRecord = {
    schema_version: 1 as const,
    type: "web_search_call" as const,
    id: "tool-3",
    status: "completed" as const,
    action: {
      type: "search" as const,
      query: "example docs",
      sources: [
        {
          type: "url" as const,
          source_id: deriveSourceId("https://example.com/docs")!,
          url: "https://example.com/docs",
          title: "Documentation",
        },
      ],
    },
    source_details: "available" as const,
    results: [
      {
        source_id: deriveSourceId("https://example.com/docs")!,
        url: "https://example.com/docs",
        title: "Documentation",
        snippet: "A readable description.",
      },
    ],
    provider: "tavily",
    truncated: false,
  };

  it("prefers the validated details.web_search record over the plain-text fallback", () => {
    const conv = makeConverter(1);
    const chunks = conv.handleEvent(
      {
        type: "tool_execution_end",
        toolCallId: "tool-3",
        toolName: "web_search",
        result: {
          content: [{ type: "text", text: "[Tavily] 1 result(s)..." }],
          details: { web_search: validWebSearchRecord },
        },
        isError: false,
      } as AgentSessionEvent,
      false,
    );

    expect(eventsOf(chunks)).toContainEqual(
      expect.objectContaining({
        type: "tool-output-available",
        toolCallId: "tool-3",
        output: validWebSearchRecord,
      }),
    );
  });

  it("falls back to plain text when details.web_search is absent (legacy mode unaffected)", () => {
    const conv = makeConverter();
    const chunks = conv.handleEvent(
      {
        type: "tool_execution_end",
        toolCallId: "tool-4",
        toolName: "web_search",
        result: {
          content: [{ type: "text", text: "[Tavily] 1 result(s)..." }],
          details: {
            usage: { raw: { tavily: { requests: 1, fetchedPages: 0 } } },
          },
        },
        isError: false,
      } as AgentSessionEvent,
      false,
    );

    expect(eventsOf(chunks)).toContainEqual(
      expect.objectContaining({
        type: "tool-output-available",
        toolCallId: "tool-4",
        output: JSON.stringify({
          content: [{ type: "text", text: "[Tavily] 1 result(s)..." }],
          details: {
            usage: { raw: { tavily: { requests: 1, fetchedPages: 0 } } },
          },
        }),
      }),
    );
  });

  it("does not let a malformed details.web_search override legacy text", () => {
    const conv = makeConverter();
    const chunks = conv.handleEvent(
      {
        type: "tool_execution_end",
        toolCallId: "tool-5",
        toolName: "web_search",
        result: {
          content: [{ type: "text", text: "legacy text wins" }],
          details: {
            web_search: { schema_version: 1, type: "not_a_search_call" },
          },
        },
        isError: false,
      } as AgentSessionEvent,
      false,
    );

    const output = eventsOf(chunks).find(
      (e) => e.type === "tool-output-available",
    )?.output;
    expect(output).not.toEqual(
      expect.objectContaining({ type: "not_a_search_call" }),
    );
  });

  it("leaves unrelated tools unaffected by the web_search structured-output check", () => {
    const conv = makeConverter();
    const chunks = conv.handleEvent(
      {
        type: "tool_execution_end",
        toolCallId: "tool-6",
        toolName: "bash",
        result: {
          content: [{ type: "text", text: "ok" }],
          details: { web_search: validWebSearchRecord },
        },
        isError: false,
      } as AgentSessionEvent,
      false,
    );

    const output = eventsOf(chunks).find(
      (e) => e.type === "tool-output-available",
    )?.output;
    expect(output).not.toEqual(validWebSearchRecord);
  });
});
