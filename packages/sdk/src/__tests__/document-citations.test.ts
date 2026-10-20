import type {
  BunnyAgentCodingRunBody,
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@bunny-agent/manager";
import {
  documentSourcesFromRead,
  hashDocumentText,
} from "@bunny-agent/manager/contracts/document-id";
import { readUIMessageStream, streamText, type UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import type {
  DocumentCitationContractMetadata,
  DocumentReadResult,
} from "../contracts";
import {
  projectUIMessageDocumentCitations,
  sliceByCodePointRange,
} from "../contracts";
import { createBunnyAgent } from "../provider/bunny-agent-provider";
import { callOptions, finish, sse } from "./citation-fixtures";

const read: DocumentReadResult = {
  schema_version: 1,
  type: "document_read_result",
  document: {
    provider: "fixture",
    namespace: "space-a",
    collection: "drive-a",
    document_id: "asset-a",
    path: "/report.pdf",
    title: "Report",
    media_type: "application/pdf",
    version: "v1",
    content_hash: hashDocumentText("original PDF"),
  },
  excerpts: [
    {
      locator: { type: "lines", start_line: 3, end_line: 3 },
      text: "Evidence",
      excerpt_hash: hashDocumentText("Evidence"),
    },
  ],
};
const source = documentSourcesFromRead(read, "documents")[0];
const text = "😀 evidence [1]";
const contract: DocumentCitationContractMetadata = {
  schema_version: 1,
  offset_unit: "unicode-code-points",
  annotations: [
    {
      type: "document_citation",
      start_index: 11,
      end_index: 14,
      source_id: source.source_id,
      title: "Report",
    },
  ],
  bindings: [
    {
      annotation_index: 0,
      source_id: source.source_id,
      origin: "explicit_source_marker",
      tool_call_ids: ["actual-read"],
    },
  ],
  sources: [source],
  processing: "complete",
};
function fixture(supported: boolean, acknowledged = true) {
  const calls: BunnyAgentCodingRunBody[] = [];
  const events = [
    ...(acknowledged
      ? [
          {
            type: "message-metadata",
            messageMetadata: { documentCitations: { version: 1 } },
          },
        ]
      : []),
    { type: "text-start", id: "answer" },
    { type: "text-delta", id: "answer", delta: text },
    {
      type: "source-document",
      sourceId: source.source_id,
      title: "Report",
      mediaType: "application/pdf",
      providerMetadata: { "bunny-agent": { document_source: source } },
    },
    {
      type: "text-end",
      id: "answer",
      providerMetadata: { "bunny-agent": { document_citations: contract } },
    },
    finish,
  ];
  const handle: SandboxHandle = {
    getSandboxId: () => "sandbox",
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
    exec: vi.fn(async function* (_args: string[], _opts?: ExecOptions) {
      yield new TextEncoder().encode(
        JSON.stringify({
          ok: true,
          data: {
            status: "ok",
            ...(supported
              ? { capabilities: { documentCitations: { version: 1 } } }
              : {}),
          },
        }) + "\n200",
      );
    }),
    streamCodingRun: async function* (body) {
      calls.push(body);
      yield* sse(events);
    },
  };
  const sandbox: SandboxAdapter = {
    attach: vi.fn(async () => handle),
    getHandle: () => handle,
  };
  const config = {
    mcpServers: {
      documents: {
        url: "http://localhost:1234/mcp",
        documentReadTools: ["read_document"],
      },
    },
  };
  const model = createBunnyAgent({
    sandbox,
    daemonUrl: "http://127.0.0.1:3080",
    runnerType: "pi",
    mcpConfig: config,
    logger: false,
  })("fixture");
  return { model, handle, sandbox, calls, config };
}
async function collect(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const reader = stream.getReader();
  const parts: unknown[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return parts;
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
describe("independent document citation SDK contract", () => {
  it.each([
    true,
    false,
  ])("negotiates document support=%s and executes exactly once without mutating caller config", async (supported) => {
    const f = fixture(supported);
    const result = await f.model.doStream(callOptions);
    const parts = await collect(result.stream);
    expect(f.calls).toHaveLength(1);
    expect(f.handle.exec).toHaveBeenCalledTimes(1);
    expect(f.sandbox.attach).toHaveBeenCalledTimes(1);
    expect(
      f.calls[0].mcpConfig?.mcpServers.documents.documentReadTools,
    ).toEqual(supported ? ["read_document"] : undefined);
    expect(f.config.mcpServers.documents.documentReadTools).toEqual([
      "read_document",
    ]);
    expect(
      parts.filter((p) => (p as { type: string }).type === "source"),
    ).toHaveLength(supported ? 1 : 0);
  });
  it("retains native source-document parts and exact receipts after real AI SDK stream and JSON persistence", async () => {
    const f = fixture(true);
    const result = streamText({
      model: f.model,
      prompt: "Read report",
      maxRetries: 0,
    });
    let message: UIMessage | undefined;
    for await (const value of readUIMessageStream({
      stream: result.toUIMessageStream({ sendSources: true }),
    }))
      message = value;
    expect(message).toBeDefined();
    const stored = JSON.parse(JSON.stringify(message));
    const documents = stored.parts.filter(
      (part: { type: string }) => part.type === "source-document",
    );
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      sourceId: source.source_id,
      mediaType: "application/pdf",
      title: "Report",
      providerMetadata: { "bunny-agent": { document_source: source } },
    });
    const projected = projectUIMessageDocumentCitations(stored);
    expect(projected[0]).toEqual({
      textPartId: "answer",
      text,
      document_citations: contract,
    });
    expect(
      sliceByCodePointRange(
        text,
        contract.annotations[0].start_index,
        contract.annotations[0].end_index,
      ),
    ).toBe("[1]");
    expect(JSON.stringify(stored)).not.toContain("download_url");
  });
  it("does not emit a document source without an actual runtime acknowledgement", async () => {
    const f = fixture(true, false);
    const result = await f.model.doStream(callOptions);
    const parts = await collect(result.stream);
    expect(
      parts.some((part) => (part as { type: string }).type === "source"),
    ).toBe(false);
    expect(JSON.stringify(parts)).not.toContain('"document_citations"');
    expect(JSON.stringify(parts)).not.toContain('"documentCitations"');
  });
  it("rejects malformed durable citation metadata rather than inventing sources", () => {
    expect(() =>
      projectUIMessageDocumentCitations({
        parts: [
          {
            type: "text",
            text,
            providerMetadata: {
              "bunny-agent": {
                textPartId: "text",
                documentCitations: { version: 1 },
                document_citations: { ...contract, sources: [] },
              },
            },
          },
        ],
      }),
    ).toThrow(TypeError);
  });
});
