import {
  type CitationContractMetadata,
  isValidCitationContractMetadata,
  type WebSearchSource,
} from "@bunny-agent/manager/contracts";
import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { SourceRegistry } from "../source-registry.js";
import {
  extractToolResultText,
  PiAISDKStreamConverter,
} from "../stream-converter.js";

const url = "https://example.com/docs";
const id = deriveSourceId(url)!;
const token = `[[cite:${id}]]`;
const source: WebSearchSource = {
  type: "url",
  source_id: id,
  url,
  title: "Docs",
};
const record = {
  schema_version: 1,
  type: "web_search_call",
  id: "provider-call",
  status: "completed",
  action: { type: "search", query: "docs", sources: [source] },
  source_details: "available",
  results: [{ source_id: id, url, title: "Docs", snippet: token }],
  provider: "fixture",
  truncated: false,
};

function converter(
  extra: {
    citationMode?: "native" | "explicit-marker";
    sourceRegistry?: SourceRegistry;
    searchContractVersion?: 1;
  } = {},
) {
  return new PiAISDKStreamConverter({
    sessionId: "session-test",
    model: { id: "fixture", provider: "fixture" },
    normalizeToolOutput: extractToolResultText,
    getUsageFromAgentEndMessages: () => undefined,
    getErrorFromAgentEndMessages: () => undefined,
    searchContractVersion: 1,
    ...extra,
  });
}
interface FixtureEvent {
  type: string;
  id?: string;
  delta?: string;
  output?: unknown;
  providerMetadata?: Record<
    string,
    { sessionId?: string; citation_contract: CitationContractMetadata }
  >;
  messageMetadata?: {
    searchContract?: { native_annotations: boolean };
    usage?: { raw: Record<string, Record<string, number>> };
  };
}

function parse(lines: string[]): FixtureEvent[] {
  return lines
    .filter((line) => line !== "data: [DONE]\n\n")
    .map((line) => JSON.parse(line.slice(6)));
}
function send(
  converter: PiAISDKStreamConverter,
  event: unknown,
  aborted = false,
) {
  return parse(converter.handleEvent(event as AgentSessionEvent, aborted));
}
function update(type: string, delta?: string, contentIndex = 0) {
  return {
    type: "message_update",
    message: { role: "assistant" },
    assistantMessageEvent: { type, delta, contentIndex },
  };
}
function search(
  converter: PiAISDKStreamConverter,
  resultRecord: unknown = record,
  isError = false,
) {
  return send(converter, {
    type: "tool_execution_end",
    toolName: "web_search",
    toolCallId: "actual-search",
    result: {
      content: [{ type: "text", text: `Readable content ${token}` }],
      details: {
        web_search: resultRecord,
        usage: { raw: { fixture: { requests: 1, fetchedPages: 2 } } },
      },
    },
    isError,
  });
}
function end(converter: PiAISDKStreamConverter, stopReason = "stop") {
  return send(converter, {
    type: "agent_end",
    messages: [{ role: "assistant", stopReason }],
  });
}
function metadata(events: FixtureEvent[]): CitationContractMetadata {
  return events.find((event) => event.type === "text-end")!.providerMetadata![
    "bunny-agent"
  ].citation_contract;
}

describe("Pi runner citation stream boundary", () => {
  it("recognizes whole canonical JSON tool-ref results and retains wrapped usage", () => {
    for (const payload of [
      record,
      {
        content: [{ type: "text", text: "human-readable" }],
        details: {
          web_search: record,
          usage: { raw: { fixture: { requests: 1, fetchedPages: 2 } } },
        },
      },
    ]) {
      const stream = converter();
      const tool = send(stream, {
        type: "tool_execution_end",
        toolName: "web_search",
        toolCallId: "http-actual",
        result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
        isError: false,
      });
      expect(
        tool.find((event) => event.type === "tool-output-available")?.output,
      ).toEqual({ ...record, id: "http-actual" });
      const events = [
        ...send(stream, update("text_delta", token)),
        ...end(stream),
      ];
      expect(
        events
          .filter((event) => event.type === "text-delta")
          .map((event) => event.delta)
          .join(""),
      ).toBe("[1]");
      expect(metadata(events).bindings[0].tool_call_ids).toEqual([
        "http-actual",
      ]);
      if ("details" in payload)
        expect(
          events.find((event) => event.type === "finish")?.messageMetadata
            ?.usage?.raw.fixture,
        ).toEqual({ requests: 1, fetchedPages: 2 });
    }
  });

  it("rejects recognized malformed v1 data instead of replacing it with legacy text", () => {
    for (const invalid of [
      { ...record, schema_version: 2 },
      {
        ...record,
        results: [
          { ...record.results[0], url: "https://example.org/conflict" },
        ],
      },
    ]) {
      const stream = converter();
      send(stream, {
        type: "tool_execution_start",
        toolName: "web_search",
        toolCallId: "actual",
        args: { query: "executed query" },
      });
      const events = search(stream, invalid);
      expect(
        events.some((event) => event.type === "tool-output-available"),
      ).toBe(false);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "tool-output-error",
          providerMetadata: {
            "bunny-agent": {
              search_result: expect.objectContaining({
                status: "failed",
                provider: "protocol",
                error: expect.objectContaining({ code: "invalid_request" }),
              }),
            },
          },
        }),
      );
    }
  });

  it("reports malformed JSON carriers safely and binds their executed query", () => {
    const stream = converter();
    send(stream, {
      type: "tool_execution_start",
      toolName: "web_search",
      toolCallId: "actual",
      args: { query: "executed query" },
    });
    const events = send(stream, {
      type: "tool_execution_end",
      toolName: "web_search",
      toolCallId: "actual",
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...record,
              status: "failed",
              error: { message: "LEAK_BODY" },
            }),
          },
        ],
      },
      isError: false,
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool-output-error",
        providerMetadata: {
          "bunny-agent": {
            search_result: expect.objectContaining({
              id: "actual",
              action: expect.objectContaining({ query: "executed query" }),
            }),
          },
        },
      }),
    );
    expect(JSON.stringify(events)).not.toContain("LEAK_BODY");
  });

  it("never promotes fetched page JSON or legacy requests into source metadata", () => {
    for (const [name, version] of [
      ["web_fetch", 1],
      ["web_search", undefined],
    ] as const) {
      const stream = converter({ searchContractVersion: version });
      const payload = JSON.stringify(record);
      const events = send(stream, {
        type: "tool_execution_end",
        toolName: name,
        toolCallId: "actual",
        result: { content: [{ type: "text", text: payload }] },
        isError: false,
      });
      expect(
        events.find((event) => event.type === "tool-output-available")?.output,
      ).toBe(payload);
    }
  });

  it("gives native structured details precedence over conflicting JSON content", () => {
    const stream = converter();
    const other = {
      ...record,
      action: { ...record.action, query: "different" },
    };
    const events = send(stream, {
      type: "tool_execution_end",
      toolName: "web_search",
      toolCallId: "actual",
      result: {
        content: [{ type: "text", text: JSON.stringify(other) }],
        details: { web_search: record },
      },
      isError: false,
    });
    expect(
      events.find((event) => event.type === "tool-output-available")?.output,
    ).toEqual({ ...record, id: "actual" });
  });

  it("registers successful tool details, binds actual calls and emits only cited URL sources before metadata", () => {
    const stream = converter();
    const tool = search(stream);
    expect(
      tool.find((e) => e.type === "tool-output-available")?.output,
    ).toEqual({ ...record, id: "actual-search" });
    expect(tool.some((e) => e.type === "source-url")).toBe(false);
    const events = [
      ...send(stream, update("text_start")),
      ...send(stream, update("text_delta", `A😀B ${token}${token}`)),
      ...end(stream),
    ];
    const text = events
      .filter((e) => e.type === "text-delta")
      .map((e) => e.delta)
      .join("");
    expect(text).toBe("A😀B [1][1]");
    const citations = metadata(events);
    expect(
      citations.annotations.map((a) => [a.start_index, a.end_index]),
    ).toEqual([
      [4, 7],
      [7, 10],
    ]);
    expect(
      citations.bindings.every(
        (binding) =>
          binding.origin === "explicit_source_marker" &&
          binding.tool_call_ids[0] === "actual-search",
      ),
    ).toBe(true);
    expect(events.filter((e) => e.type === "source-url")).toEqual([
      { type: "source-url", sourceId: id, url, title: "Docs" },
    ]);
    expect(events.findIndex((e) => e.type === "source-url")).toBeLessThan(
      events.findIndex((e) => e.type === "text-end"),
    );
    expect(
      new Set(events.filter((e) => e.type.startsWith("text-")).map((e) => e.id))
        .size,
    ).toBe(1);
    expect(
      events.find((e) => e.type === "text-end")!.providerMetadata![
        "bunny-agent"
      ].sessionId,
    ).toBe("session-test");
    expect(
      isValidCitationContractMetadata(citations, {
        text,
        sources: [source],
      }),
    ).toBe(true);
  });

  it("keeps search content and reasoning outside answer citations and finalizes empty annotations", () => {
    const stream = converter();
    search(stream);
    send(stream, update("thinking_delta", token));
    const events = [
      ...send(stream, update("text_delta", `[Docs](${url})`)),
      ...end(stream),
    ];
    expect(metadata(events)).toEqual({
      schema_version: 1,
      offset_unit: "unicode-code-points",
      annotations: [],
      bindings: [],
      processing: "complete",
    });
    expect(events.some((e) => e.type === "source-url")).toBe(false);
  });

  it("uses stable numbering and per-part ranges across reasoning/tools and ignores duplicate terminal events", () => {
    const stream = converter();
    search(stream);
    send(stream, update("text_start"));
    send(stream, update("text_delta", token));
    const closed = send(stream, update("thinking_start", undefined, 1));
    expect(metadata(closed).annotations[0].start_index).toBe(0);
    expect(send(stream, update("text_end"))).toEqual([]);
    expect(send(stream, update("text_start"))).toEqual([]);
    expect(send(stream, update("text_delta", token))).toEqual([]);
    send(stream, update("thinking_delta", token, 1));
    send(stream, { type: "message_start", message: { role: "assistant" } });
    const next = [
      ...send(stream, update("text_start")),
      ...send(stream, update("text_delta", `Again ${token}`)),
      ...end(stream),
    ];
    expect(next.find((e) => e.type === "text-delta")!.delta).toBe("Again [1]");
    expect(metadata(next).annotations[0].start_index).toBe(6);
    expect(next.some((e) => e.type === "source-url")).toBe(false);
    expect(end(stream)).toEqual([]);
    expect(stream.forceError("late")).toEqual([]);
  });

  it.each([
    true,
    false,
  ])("preserves structured failures and tool usage even when Pi isError is %s", (isError) => {
    const stream = converter();
    const failed = {
      ...record,
      status: "failed",
      action: { ...record.action, sources: [] },
      results: [],
      source_details: "unavailable",
      error: {
        code: "rate_limit",
        message: "Search rate limit exceeded.",
        retryable: true,
      },
    };
    const errors = search(stream, failed, isError);
    expect(errors.find((e) => e.type === "tool-output-error")).toMatchObject({
      errorText: failed.error.message,
      providerMetadata: {
        "bunny-agent": { search_result: { ...failed, id: "actual-search" } },
      },
    });
    const events = [
      ...send(stream, update("text_delta", token)),
      ...end(stream),
    ];
    expect(events.find((e) => e.type === "text-delta")!.delta).toBe(token);
    expect(metadata(events).annotations).toEqual([]);
    expect(
      events.find((e) => e.type === "finish")!.messageMetadata!.usage!.raw
        .fixture,
    ).toEqual({ requests: 1, fetchedPages: 2 });
    expect(events.some((e) => e.type === "source-url")).toBe(false);
  });

  it.each([
    "abort",
    "length",
  ])("flushes pending text and safe prior annotations on %s", (termination) => {
    const stream = converter();
    search(stream);
    const visible = send(stream, update("text_delta", `${token} [[ci`));
    const terminal =
      termination === "abort"
        ? parse(stream.forceError("Aborted"))
        : end(stream, "length");
    const events = [...visible, ...terminal];
    expect(
      events
        .filter((e) => e.type === "text-delta")
        .map((e) => e.delta)
        .join(""),
    ).toBe("[1] [[ci");
    expect(metadata(events).processing).toBe("partial");
    expect(
      isValidCitationContractMetadata(metadata(events), {
        text: "[1] [[ci",
        sources: [source],
      }),
    ).toBe(true);
    expect(terminal.findIndex((e) => e.type === "text-end")).toBeLessThan(
      terminal.findIndex((e) => e.type === "finish"),
    );
    expect(send(stream, update("text_delta", "late"))).toEqual([]);
  });

  it("waits for the real message stop reason after provider text_end", () => {
    const stream = converter();
    search(stream);
    send(stream, update("text_delta", `${token} [[ci`));
    expect(send(stream, update("text_end"))).toEqual([]);
    expect(send(stream, update("text_delta", "late"))).toEqual([]);
    const terminal = send(stream, {
      type: "message_end",
      message: { role: "assistant", stopReason: "length" },
    });
    expect(metadata(terminal).processing).toBe("partial");
    expect(terminal.find((e) => e.type === "text-delta")!.delta).toBe("[[ci");
    expect(send(stream, update("text_end"))).toEqual([]);
    expect(end(stream, "length").some((e) => e.type === "text-end")).toBe(
      false,
    );
  });

  it("selects native mode before text emission and transports validated fixture metadata without rewriting", () => {
    const stream = converter({ citationMode: "native" });
    const start = send(stream, update("text_start"));
    const textId = start.find((e) => e.type === "text-start")!.id!;
    const text = `A😀B [1] ${token}`;
    expect(
      send(stream, update("text_delta", text)).find(
        (e) => e.type === "text-delta",
      )!.delta,
    ).toBe(text);
    stream.ingestNativeAnnotations({
      textId,
      offsetUnit: "utf-16",
      annotations: [
        {
          type: "url_citation",
          start_index: 5,
          end_index: 8,
          url,
          title: "Native docs",
        },
      ],
    });
    const terminal = end(stream);
    expect(metadata(terminal).annotations[0]).toMatchObject({
      start_index: 4,
      end_index: 7,
    });
    expect(metadata(terminal).bindings[0].origin).toBe("provider");
    expect(terminal.filter((e) => e.type === "source-url")).toHaveLength(1);
    stream.ingestNativeAnnotations({
      textId,
      offsetUnit: "utf-16",
      annotations: [],
    });
    expect(end(stream)).toEqual([]);
    // A fixture boundary is not evidence that the installed adapter has native capability.
    expect(
      start.find((e) => e.type === "message-metadata")!.messageMetadata!
        .searchContract!.native_annotations,
    ).toBe(false);
  });

  it("leaves legacy text and metadata unchanged", () => {
    const stream = converter({ searchContractVersion: undefined });
    search(stream);
    const events = [
      ...send(stream, update("text_delta", token)),
      ...end(stream),
    ];
    expect(events.find((e) => e.type === "text-delta")!.delta).toBe(token);
    expect(
      events.find((e) => e.type === "text-end")!.providerMetadata,
    ).toBeUndefined();
    expect(events.some((e) => e.type === "source-url")).toBe(false);
  });
});
