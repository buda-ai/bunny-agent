import type { WebSearchCallRecord } from "@bunny-agent/manager/contracts";
import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import { describe, expect, it, vi } from "vitest";
import { CitationTextProcessor } from "../citation-processor.js";
import {
  CITATION_CACHE_TYPE,
  createCitationSessionRegistry,
} from "../citation-session-cache.js";
import { SourceRegistry, sourceReference } from "../source-registry.js";

// Deliberately create a compact-alias collision without searching for SHA-256
// preimages. Production identity validation continues to use the real digest.
vi.mock("@bunny-agent/manager/contracts/source-id", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@bunny-agent/manager/contracts/source-id")
    >();
  return {
    ...actual,
    deriveSourceId: (url: string) =>
      url === "https://example.com/collision-a"
        ? `src_${"0".repeat(12)}${"a".repeat(52)}`
        : url === "https://example.com/collision-b"
          ? `src_${"0".repeat(12)}${"b".repeat(52)}`
          : actual.deriveSourceId(url),
  };
});

function source(path: string) {
  const url = `https://example.com/${path}`;
  return { type: "url" as const, source_id: deriveSourceId(url)!, url };
}

describe("exact compact source References", () => {
  it("keeps identities and tool provenance distinct across multiple search calls", () => {
    const registry = new SourceRegistry();
    const first = source("one");
    const second = source("two");
    for (const [id, sources] of [
      ["search-1", [first]],
      ["search-2", [second, first]],
    ] as const) {
      registry.registerSearch({
        schema_version: 1,
        type: "web_search_call",
        id,
        status: "completed",
        action: { type: "search", query: "docs", sources: [...sources] },
        results: sources.map(({ source_id, url }) => ({ source_id, url })),
        source_details: "available",
        provider: "fixture",
        truncated: false,
      } satisfies WebSearchCallRecord);
    }
    expect(registry.resolve(sourceReference(first.source_id))).toMatchObject({
      ...first,
      tool_call_ids: ["search-1", "search-2"],
    });
    expect(registry.resolve(sourceReference(second.source_id))).toMatchObject({
      ...second,
      tool_call_ids: ["search-2"],
    });
    expect(
      registry.resolve(sourceReference(first.source_id).toUpperCase()),
    ).toBeUndefined();
    expect(
      registry.resolve(sourceReference(first.source_id).slice(0, -1)),
    ).toBeUndefined();
    expect(
      new SourceRegistry().resolve(sourceReference(first.source_id)),
    ).toBeUndefined();
  });

  it("rejects a colliding compact Reference while preserving exact canonical compatibility", () => {
    const registry = new SourceRegistry();
    const first = source("collision-a");
    const second = source("collision-b");
    registry.register(first, ["search-a"]);
    registry.register(second, ["search-b"]);
    const reference = sourceReference(first.source_id);
    expect(reference).toBe(sourceReference(second.source_id));
    expect(registry.resolve(reference)).toBeUndefined();
    expect(registry.resolve(first.source_id)?.url).toBe(first.url);
    expect(registry.resolve(second.source_id)?.url).toBe(second.url);
    const processor = new CitationTextProcessor(
      "text",
      "explicit-marker",
      registry,
      new Map(),
    );
    expect(processor.push(`[[cite:${reference}]]`) + processor.finish()).toBe(
      `[[cite:${reference}]]`,
    );
    expect(processor.metadata.annotations).toEqual([]);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        message: "An ambiguous source reference was rejected.",
      }),
    );
  });

  it("detects historical collisions beyond the 20-source prompt view and excludes unreachable records", () => {
    const entries = [
      source("collision-a"),
      source("collision-b"),
      ...Array.from({ length: 21 }, (_, i) => source(`recent-${i}`)),
    ].map((entry) => ({
      type: "custom",
      customType: CITATION_CACHE_TYPE,
      data: {
        schema_version: 1,
        sources: [{ ...entry, tool_call_ids: ["search"] }],
      },
    }));
    const store = {
      getLeafId: () => "captured-leaf",
      getBranch: (leaf?: string) => {
        expect(leaf).toBe("captured-leaf");
        return entries;
      },
      appendCustomEntry: () => "new-entry",
    };
    const registry = createCitationSessionRegistry(store, true);
    const first = source("collision-a");
    const reference = sourceReference(first.source_id);
    expect(registry.resolve(first.source_id)).toBeDefined();
    expect(registry.resolve(reference)).toBeUndefined();
    const isolated = createCitationSessionRegistry(
      { ...store, getBranch: () => [entries[0]] },
      true,
    );
    expect(isolated.resolve(reference)?.source_id).toBe(first.source_id);
  });
});
