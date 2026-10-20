import type { WebSearchCallRecord } from "@bunny-agent/manager/contracts";
import { deriveSourceId } from "@bunny-agent/manager/contracts/source-id";
import { describe, expect, it } from "vitest";
import { CitationTextProcessor } from "../citation-processor.js";
import { createCitationSessionRegistry } from "../citation-session-cache.js";
import { SourceRegistry } from "../source-registry.js";

function source(path: string) {
  const url = `https://example.com/${path}`;
  return { type: "url" as const, source_id: deriveSourceId(url)!, url };
}
function search(id: string, paths: string[]): WebSearchCallRecord {
  const sources = paths.map(source);
  return {
    schema_version: 1,
    type: "web_search_call",
    id,
    status: "completed",
    action: { type: "search", query: "docs", sources },
    results: sources.map(({ source_id, url }) => ({ source_id, url })),
    source_details: "available",
    provider: "fixture",
    truncated: false,
  };
}

describe("OpenAI tool invocation references", () => {
  it("increments the turn per invocation and the URL index per result, including repeated URLs", () => {
    const registry = new SourceRegistry();
    registry.registerSearch(search("search-1", ["one", "two"]));
    registry.registerSearch(search("search-2", ["two", "one"]));
    expect(registry.resolve("turn0url0")?.url).toBe(source("one").url);
    expect(registry.resolve("turn0url1")?.url).toBe(source("two").url);
    expect(registry.resolve("turn1url0")?.url).toBe(source("two").url);
    expect(registry.resolve("turn1url1")?.url).toBe(source("one").url);
    expect(registry.resolve("turn0url0")?.tool_call_ids).toEqual([
      "search-1",
      "search-2",
    ]);
    expect(registry.resolve("TURN0URL0")).toBeUndefined();
    expect(registry.resolve("turn9url0")).toBeUndefined();
    expect(
      registry.referenceForSource(source("two").source_id, "search-2"),
    ).toBe("turn1url0");
  });

  it("persists references and failed invocation turns across resume and selected fork ancestry", () => {
    const entries: unknown[] = [];
    const store = {
      getLeafId: () => "leaf",
      getBranch: () => [...entries],
      appendCustomEntry: (customType: string, data: unknown) => {
        entries.push({ type: "custom", customType, data });
        return String(entries.length);
      },
    };
    const first = createCitationSessionRegistry(store, true);
    first.reserveSearch("failed-search");
    first.registerSearch(search("success-search", ["one", "two"]));
    const selected = [...entries];
    first.registerSearch(search("sibling-search", ["sibling"]));
    const resumed = createCitationSessionRegistry(
      { ...store, getBranch: () => selected },
      true,
    );
    expect(resumed.resolve("turn1url1")?.url).toBe(source("two").url);
    expect(resumed.resolve("turn2url0")).toBeUndefined();
    resumed.registerSearch(search("fork-search", ["fork"]));
    expect(resumed.resolve("turn2url0")?.url).toBe(source("fork").url);
  });

  it("supports several references in one official marker with exact Unicode ranges", () => {
    const registry = new SourceRegistry();
    registry.registerSearch(search("call", ["one", "two"]));
    const input = "A😀B \uE200cite\uE202turn0url0\uE202turn0url1\uE201";
    for (let split = 0; split <= input.length; split++) {
      const processor = new CitationTextProcessor(
        "text",
        "explicit-marker",
        registry,
        new Map(),
      );
      expect(
        processor.push(input.slice(0, split)) +
          processor.push(input.slice(split)) +
          processor.finish(),
      ).toBe("A😀B [1][2]");
      expect(
        processor.metadata.annotations.map(({ start_index, end_index }) => [
          start_index,
          end_index,
        ]),
      ).toEqual([
        [4, 7],
        [7, 10],
      ]);
    }
  });

  it("deduplicates references to the same canonical URL in a multi-source marker", () => {
    const registry = new SourceRegistry();
    registry.registerSearch(search("first", ["one"]));
    registry.registerSearch(search("second", ["one"]));
    const processor = new CitationTextProcessor(
      "text",
      "explicit-marker",
      registry,
      new Map(),
    );
    expect(
      processor.push("\uE200cite\uE202turn0url0\uE202turn1url0\uE201") +
        processor.finish(),
    ).toBe("[1]");
    expect(processor.metadata.annotations).toHaveLength(1);
  });

  it("reconstructs exact per-call references from typed tool-result ancestry", () => {
    const entries = ["first", "second"].map((id) => ({
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: id,
        details: { web_search: search(id, [id, "shared"]) },
      },
    }));
    const registry = createCitationSessionRegistry(
      {
        getLeafId: () => "leaf",
        getBranch: () => entries,
        appendCustomEntry: () => "saved",
      },
      true,
    );
    expect(registry.resolve("turn0url1")?.url).toBe(source("shared").url);
    expect(registry.resolve("turn1url0")?.url).toBe(source("second").url);
    registry.registerSearch(search("third", ["third"]));
    expect(registry.resolve("turn2url0")?.url).toBe(source("third").url);
  });

  it("does not promote obsolete custom markers or fabricated URL line locators", () => {
    const registry = new SourceRegistry();
    registry.registerSearch(search("call", ["one"]));
    const input =
      "[[cite:ref_000000000000]] \uE200cite\uE202turn0url0\uE202L1-L2\uE201";
    const processor = new CitationTextProcessor(
      "text",
      "explicit-marker",
      registry,
      new Map(),
    );
    expect(processor.push(input) + processor.finish()).toBe(input);
    expect(processor.metadata.annotations).toEqual([]);
  });
});
