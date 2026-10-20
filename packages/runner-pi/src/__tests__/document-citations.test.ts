import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isValidDocumentCitationContractMetadata } from "@bunny-agent/manager/contracts";
import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import {
  type AgentSessionEvent,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { CitationTextProcessor } from "../citation-processor.js";
import { DocumentSourceRegistry } from "../document-registry.js";
import { SourceRegistry, sourceReference } from "../source-registry.js";
import { PiAISDKStreamConverter } from "../stream-converter.js";
import { documentRead } from "./document-fixtures.js";

describe("trusted document source processing", () => {
  it("emits an independently acknowledged document-only stream and marks length termination partial", () => {
    const documents = new DocumentSourceRegistry(
      undefined,
      new Set(["documents"]),
    );
    const [source] = documents.registerRead(
      documentRead(),
      "documents",
      "actual-read",
    );
    const converter = new PiAISDKStreamConverter({
      sessionId: "session",
      model: { provider: "openai", id: "fixture" },
      documentRegistry: documents,
      normalizeToolOutput: JSON.stringify,
      getUsageFromAgentEndMessages: () => undefined,
      getErrorFromAgentEndMessages: () => undefined,
    });
    const update = (type: string, delta?: string) =>
      ({
        type: "message_update",
        message: {},
        assistantMessageEvent: { type, delta },
      }) as unknown as AgentSessionEvent;
    const chunks = [
      ...converter.handleEvent(update("text_start"), false),
      ...converter.handleEvent(
        update(
          "text_delta",
          `😀 evidence [[cite:${sourceReference(source.source_id)}]]`,
        ),
        false,
      ),
      ...converter.handleEvent(update("text_end"), false),
      ...converter.handleEvent(
        {
          type: "message_end",
          message: { role: "assistant", stopReason: "length" },
        } as AgentSessionEvent,
        false,
      ),
    ];
    const events = chunks.map((chunk) => JSON.parse(chunk.slice(6)));
    expect(
      events.find((event) => event.type === "message-metadata").messageMetadata,
    ).toEqual({ sessionId: "session", documentCitations: { version: 1 } });
    expect(
      events.find((event) => event.type === "source-document").providerMetadata[
        "bunny-agent"
      ].document_source,
    ).toEqual((({ tool_call_ids: _ids, ...receipt }) => receipt)(source));
    const metadata = events.find((event) => event.type === "text-end")
      .providerMetadata["bunny-agent"];
    expect(metadata.citation_contract).toBeUndefined();
    expect(metadata.document_citations.processing).toBe("partial");
    const text = events
      .filter((event) => event.type === "text-delta")
      .map((event) => event.delta)
      .join("");
    expect(text).toBe("😀 evidence [1]");
    expect(
      isValidDocumentCitationContractMetadata(metadata.document_citations, {
        text,
      }),
    ).toBe(true);
  });
  it("uses one scanner and shared numbering for mixed web and document citations across every Unicode split", () => {
    const documents = new DocumentSourceRegistry(
      undefined,
      new Set(["documents"]),
    );
    const [source] = documents.registerRead(
      documentRead(),
      "documents",
      "actual-read",
    );
    const web = new SourceRegistry();
    const url = "https://example.com/docs";
    const sourceId = deriveSourceId(url)!;
    web.register({ type: "url", source_id: sourceId, url, title: "Web" }, [
      "search",
    ]);
    const input = `😀 web [[cite:${sourceReference(sourceId)}]] doc [[cite:${sourceReference(source.source_id)}]]`;
    for (let split = 0; split <= input.length; split++) {
      const processor = new CitationTextProcessor(
        "text",
        "explicit-marker",
        web,
        new Map(),
        documents,
      );
      const output =
        processor.push(input.slice(0, split)) +
        processor.push(input.slice(split)) +
        processor.finish();
      expect(output).toBe("😀 web [1] doc [2]");
      expect(processor.metadata.annotations[0]).toMatchObject({
        start_index: 6,
        end_index: 9,
      });
      expect(processor.documentMetadata.annotations[0]).toMatchObject({
        start_index: 14,
        end_index: 17,
      });
      expect(processor.documentMetadata.bindings[0].tool_call_ids).toEqual([
        "actual-read",
      ]);
      expect(
        isValidDocumentCitationContractMetadata(processor.documentMetadata, {
          text: output,
        }),
      ).toBe(true);
    }
  });
  it("keeps separate read spans, verifies actual excerpt hashes, and never trusts an unconfigured producer", () => {
    const documents = new DocumentSourceRegistry(
      undefined,
      new Set(["documents"]),
    );
    expect(
      documents.registerRead(documentRead(), "other", "forged-call"),
    ).toEqual([]);
    const [first] = documents.registerRead(
      documentRead(),
      "documents",
      "read-1",
    );
    const [second] = documents.registerRead(
      documentRead("Other evidence", 20),
      "documents",
      "read-2",
    );
    expect(first.document_key).toBe(second.document_key);
    expect(first.source_id).not.toBe(second.source_id);
    expect(
      documents.resolve(sourceReference(second.source_id))?.tool_call_ids,
    ).toEqual(["read-2"]);
    expect(documents.resolve(first.source_id)?.tool_call_ids).toEqual([
      "read-1",
    ]);
    documents.registerRead(documentRead(), "documents", "read-3");
    expect(documents.resolve(first.source_id)?.tool_call_ids).toEqual([
      "read-1",
      "read-3",
    ]);
    const corrupt = documentRead();
    corrupt.excerpts[0].text = "Changed\nEvidence";
    expect(documents.registerRead(corrupt, "documents", "bad-read")).toEqual(
      [],
    );
    expect(documents.resolve("ref_000000000000")).toBeUndefined();
  });
  it("restores only the captured reachable session ancestry across fork and compaction", () => {
    const directory = mkdtempSync(join(tmpdir(), "document-citations-"));
    const manager = SessionManager.create(directory, directory);
    manager.appendMessage({
      role: "user",
      content: "Read report",
      timestamp: Date.now(),
    });
    const documents = new DocumentSourceRegistry(
      manager,
      new Set(["documents"]),
    );
    const [inherited] = documents.registerRead(
      documentRead(),
      "documents",
      "root-read",
    );
    const branchPoint = manager.getLeafId()!;
    const [sibling] = documents.registerRead(
      documentRead("Sibling", 50),
      "documents",
      "sibling-read",
    );
    manager.branch(branchPoint);
    const keep = manager.appendMessage({
      role: "user",
      content: "Continue selected branch",
      timestamp: Date.now(),
    });
    manager.appendCompaction("Summary", keep, 100);
    const snapshot = new DocumentSourceRegistry(
      manager,
      new Set(["documents"]),
    );
    documents.registerRead(
      documentRead("Future", 90),
      "documents",
      "future-read",
    );
    expect(snapshot.resolve(sibling.source_id)).toBeUndefined();
    expect(
      snapshot.resolve(sourceReference(inherited.source_id))?.tool_call_ids,
    ).toEqual(["root-read"]);
    const fork = SessionManager.forkFrom(
      manager.getSessionFile()!,
      directory,
      directory,
    );
    const restored = new DocumentSourceRegistry(
      SessionManager.open(fork.getSessionFile()!),
      new Set(["documents"]),
    );
    expect(
      restored.resolve(sourceReference(inherited.source_id))?.source_id,
    ).toBe(inherited.source_id);
    expect(restored.resolve(sibling.source_id)).toBeUndefined();
    expect(
      new DocumentSourceRegistry(manager, new Set(["other"])).resolve(
        inherited.source_id,
      ),
    ).toBeUndefined();
  });
});
