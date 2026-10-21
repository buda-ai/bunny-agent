import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import type { SandboxAdapter, SandboxHandle } from "@bunny-agent/manager";
import type {
  CitationContractMetadata,
  SearchContractCapabilities,
  WebSearchCallRecord,
} from "../contracts.js";

export const capabilities: SearchContractCapabilities = {
  version: 1,
  structured_retrieval: true,
  native_annotations: false,
  explicit_source_marker_annotations: true,
};
export const sourceId = `src_${"a".repeat(64)}`;
export const source = {
  type: "url" as const,
  source_id: sourceId,
  url: "https://example.com/docs",
  title: "Documentation",
};
export const text = "A😀B [1]";
export const citationContract: CitationContractMetadata = {
  schema_version: 1,
  offset_unit: "unicode-code-points",
  processing: "complete",
  annotations: [
    {
      type: "url_citation",
      start_index: 4,
      end_index: 7,
      url: source.url,
      title: source.title,
    },
  ],
  bindings: [
    {
      annotation_index: 0,
      source_id: sourceId,
      origin: "explicit_source_marker",
      tool_call_ids: ["search-ok"],
    },
  ],
};
export const success: WebSearchCallRecord = {
  schema_version: 1,
  type: "web_search_call",
  id: "search-ok",
  status: "completed",
  action: {
    type: "search",
    query: "documentation",
    sources: [
      source,
      {
        type: "url",
        source_id: "src_uncited",
        url: "https://example.com/uncited",
        title: "Unused",
      },
    ],
  },
  source_details: "available",
  results: [
    {
      source_id: sourceId,
      url: source.url,
      title: source.title,
      snippet: "A guide.",
    },
    {
      source_id: "src_uncited",
      url: "https://example.com/uncited",
      title: "Unused",
    },
  ],
  provider: "tavily",
  truncated: false,
};
export const failure = {
  schema_version: 1,
  type: "web_search_call",
  id: "search-error",
  status: "failed",
  action: { type: "search", query: "documentation", sources: [] },
  source_details: "unavailable",
  results: [],
  provider: "tavily",
  truncated: false,
  error: {
    code: "rate_limit",
    message: "Web search rate limit exceeded.",
    retryable: true,
  },
} satisfies WebSearchCallRecord;
export const callOptions: LanguageModelV3CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
};
export const ack = {
  type: "message-metadata",
  messageMetadata: {
    sessionId: "session-fixture",
    searchContract: capabilities,
  },
};
export const finish = {
  type: "finish",
  finishReason: "stop",
  messageMetadata: { unrelatedFinish: "retained" },
};
export const terminal = {
  type: "text-end",
  id: "runner-text-42",
  providerMetadata: {
    "bunny-agent": {
      citation_contract: citationContract,
      terminalField: "retained",
    },
    other: { terminal: true },
  },
};

/** Recorded runner-boundary events: search envelopes, finalized marker text, sources. */
export function recordedEvents(): Record<string, unknown>[] {
  return [
    ack,
    ...["search-ok", "search-error"].flatMap((toolCallId) => [
      {
        type: "tool-input-start",
        toolCallId,
        toolName: "web_search",
        providerExecuted: true,
        providerMetadata: {
          other: { input: true },
          "bunny-agent": { toolField: "retained" },
        },
      },
      {
        type: "tool-input-available",
        toolCallId,
        toolName: "web_search",
        input: { query: "documentation" },
        providerExecuted: true,
      },
      toolCallId === "search-ok"
        ? {
            type: "tool-output-available",
            toolCallId,
            output: success,
            providerExecuted: true,
            providerMetadata: {
              other: { output: true },
              "bunny-agent": { usage: { requests: 1 } },
            },
          }
        : {
            type: "tool-output-error",
            toolCallId,
            errorText: failure.error.message,
            providerExecuted: true,
            providerMetadata: {
              other: { output: true },
              "bunny-agent": { search_result: failure, usage: { requests: 1 } },
            },
          },
    ]),
    {
      type: "text-start",
      id: "runner-text-42",
      providerMetadata: {
        other: { start: true },
        "bunny-agent": { startField: "retained" },
      },
    },
    { type: "text-delta", id: "runner-text-42", delta: text },
    { type: "source-url", sourceId, url: source.url, title: source.title },
    {
      type: "source-url",
      sourceId: "src_uncited",
      url: "https://example.com/uncited",
    },
    { type: "source-url", sourceId: "src_unsafe", url: "javascript:alert(1)" },
    terminal,
    terminal,
    { type: "source-url", sourceId, url: source.url, title: source.title },
    finish,
    finish,
    ack,
  ];
}

export function sse(events: readonly Record<string, unknown>[]): Uint8Array[] {
  return events.map((event) =>
    new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
  );
}

export function sandboxFor(
  stream: () => AsyncIterable<Uint8Array>,
): SandboxAdapter {
  const handle: SandboxHandle = {
    getSandboxId: () => null,
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec: async function* () {},
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
    streamCodingRun: stream,
  };
  return {
    attach: async () => handle,
    getHandle: () => handle,
    getWorkdir: () => "/workspace",
  };
}

export function recordedSandbox(events = recordedEvents()): SandboxAdapter {
  return sandboxFor(async function* () {
    // Split every UTF-8 byte, including the emoji and JSON field names.
    for (const chunk of sse(events))
      for (const byte of chunk) yield Uint8Array.of(byte);
  });
}
