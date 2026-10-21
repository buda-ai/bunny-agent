import {
  isValidCitationContractMetadata,
  isValidWebSearchCallRecord,
  type WebSearchCallRecord,
} from "@bunny-agent/manager/contracts";
import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import { describe, expect, it } from "vitest";
import { CitationTextProcessor } from "../citation-processor.js";
import {
  CITATION_CACHE_TYPE,
  type CitationSessionStore,
  createCitationSessionRegistry,
} from "../citation-session-cache.js";
import { isRegisteredSource, SourceRegistry } from "../source-registry.js";

const source = {
  type: "url" as const,
  source_id: deriveSourceId("https://example.com/docs")!,
  url: "https://example.com/docs",
  title: "Documentation",
};

function search(id: string): WebSearchCallRecord {
  return {
    schema_version: 1,
    type: "web_search_call",
    id,
    status: "completed",
    action: { type: "search", query: "documentation", sources: [source] },
    results: [{ ...source, snippet: "Supporting evidence." }],
    source_details: "available",
    provider: "fixture",
    truncated: false,
  };
}

function store(entries: unknown[]): CitationSessionStore {
  return {
    getLeafId: () => "leaf",
    getBranch: () => entries,
    appendCustomEntry: () => "entry",
  };
}

const idLengths = [1024, 1025, 1094, 1998, 8192];

function providerId(length: number): string {
  return `call_123456__thought__${"s".repeat(length - 22)}`;
}

describe("opaque provider tool-call provenance", () => {
  it.each(
    idLengths,
  )("resolves valid citations with a %i-character tool-call ID", (length) => {
    const id = providerId(length);
    expect(id).toHaveLength(length);
    const record = search(id);
    expect(isValidWebSearchCallRecord(record)).toBe(true);
    const registry = new SourceRegistry();
    registry.registerSearch(record);
    const processor = new CitationTextProcessor(
      "text",
      "explicit-marker",
      registry,
      new Map(),
    );
    const text =
      processor.push("Supported. \uE200cite\uE202turn0url0\uE201") +
      processor.finish();
    expect(text).toBe("Supported. [1]");
    expect(processor.metadata.bindings[0].tool_call_ids).toEqual([id]);
    expect(
      isValidCitationContractMetadata(processor.metadata, {
        text,
        sources: [source],
      }),
    ).toBe(true);
    expect(registry.diagnostics).toEqual([]);
  });

  it.each(
    idLengths,
  )("restores a %i-character ID from the versioned source cache", (length) => {
    const id = providerId(length);
    const cached = {
      ...source,
      tool_call_ids: [id],
      references: { turn7url0: id },
    };
    expect(isRegisteredSource(cached)).toBe(true);
    const registry = createCitationSessionRegistry(
      store([
        {
          type: "custom",
          customType: CITATION_CACHE_TYPE,
          data: { schema_version: 1, sources: [cached] },
        },
      ]),
      true,
    );
    expect(registry.resolve("turn7url0")).toEqual(cached);
    expect(registry.reserveSearch("next-call")).toBe(8);
  });

  it.each(
    idLengths,
  )("reconstructs sources from a typed tool result with a %i-character ID", (length) => {
    const id = providerId(length);
    const registry = createCitationSessionRegistry(
      store([
        {
          type: "message",
          message: {
            role: "toolResult",
            toolCallId: id,
            details: { web_search: search(id) },
          },
        },
      ]),
      true,
    );
    expect(registry.resolve("turn0url0")?.tool_call_ids).toEqual([id]);
    expect(registry.resolve("turn0url0")?.url).toBe(source.url);
  });

  it.each(
    idLengths,
  )("preserves a %i-character ID in restored turn reservations without sources", (length) => {
    const id = providerId(length);
    const registry = createCitationSessionRegistry(
      store([
        {
          type: "custom",
          customType: CITATION_CACHE_TYPE,
          data: { schema_version: 1, calls: [{ id, turn: 7 }], sources: [] },
        },
      ]),
      true,
    );
    expect(registry.reserveSearch(id)).toBe(7);
    expect(registry.reserveSearch("next-call")).toBe(8);
  });

  it("keeps distinct signed IDs separate even when their base ID is identical", () => {
    const first = providerId(1094);
    const second = `${first.slice(0, -1)}t`;
    const registry = new SourceRegistry();
    registry.registerSearch(search(first));
    registry.registerSearch(search(second));
    expect(registry.resolve("turn0url0")?.references?.turn0url0).toBe(first);
    expect(registry.resolve("turn1url0")?.references?.turn1url0).toBe(second);
    expect(registry.resolve("turn0url0")?.tool_call_ids).toEqual([
      first,
      second,
    ]);
    expect(registry.reserveSearch(first)).toBe(0);
    expect(registry.reserveSearch(second)).toBe(1);
  });

  it.each(["", "   "])("still rejects empty provenance %j", (id) => {
    const registry = new SourceRegistry();
    expect(registry.register(source, [id])).toBeUndefined();
    expect(isRegisteredSource({ ...source, tool_call_ids: [id] })).toBe(false);
  });
});
