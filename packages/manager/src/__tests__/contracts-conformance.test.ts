import { describe, expect, it } from "vitest";
import {
  isAnnotationRangeValidForText,
  isUrlCitationAnnotation,
  isValidCitationContractMetadata,
  isValidWebSearchCallRecord,
  projectOutputText,
} from "../contracts/index.js";
import {
  buildWebSearchCallRecord,
  classifyWebSearchError,
} from "../contracts/record.js";
import type {
  CitationContractMetadata,
  WebSearchCallRecord,
} from "../contracts/types.js";

const a = {
  type: "url" as const,
  source_id: "src_a",
  url: "https://example.com/a",
  title: "A",
};
const b = {
  type: "url" as const,
  source_id: "src_b",
  url: "https://example.com/b",
  title: "B",
};
function record(): WebSearchCallRecord {
  return {
    schema_version: 1,
    type: "web_search_call",
    id: "call_a",
    status: "completed",
    action: { type: "search", query: "docs", sources: [a] },
    source_details: "available",
    results: [{ source_id: a.source_id, url: a.url, title: a.title }],
    provider: "tavily",
    truncated: false,
  };
}
function metadata(): CitationContractMetadata {
  return {
    schema_version: 1,
    offset_unit: "unicode-code-points",
    processing: "complete",
    annotations: [
      {
        type: "url_citation",
        start_index: 0,
        end_index: 3,
        url: a.url,
        title: a.title,
      },
    ],
    bindings: [
      {
        annotation_index: 0,
        source_id: a.source_id,
        origin: "explicit_source_marker",
        tool_call_ids: ["call_a"],
      },
    ],
  };
}

describe("search record conformance", () => {
  it("rejects a result ID retargeted to another URL", () => {
    expect(
      isValidWebSearchCallRecord({
        ...record(),
        results: [{ source_id: a.source_id, url: b.url }],
      }),
    ).toBe(false);
  });
  it("rejects conflicting and duplicate source identities", () => {
    for (const sources of [
      [a, { ...b, source_id: a.source_id }],
      [a, { ...a, source_id: b.source_id }],
      [a, a],
    ]) {
      expect(
        isValidWebSearchCallRecord({
          ...record(),
          action: { type: "search", query: "docs", sources },
        }),
      ).toBe(false);
    }
  });
  it("requires failure information and forbids completed errors", () => {
    expect(
      isValidWebSearchCallRecord({
        ...record(),
        status: "failed",
        source_details: "unavailable",
        action: { type: "search", query: "docs", sources: [] },
        results: [],
      }),
    ).toBe(false);
    expect(
      isValidWebSearchCallRecord({
        ...record(),
        error: { code: "network", message: "failed", retryable: true },
      }),
    ).toBe(false);
  });
  it("rejects oversized imported source arrays even if marked truncated", () => {
    const sources = Array.from({ length: 51 }, (_, i) => ({
      ...a,
      source_id: `src_${i}`,
      url: `https://example.com/${i}`,
    }));
    expect(
      isValidWebSearchCallRecord({
        ...record(),
        action: { type: "search", query: "docs", sources },
        results: [],
        truncated: true,
      }),
    ).toBe(false);
  });
  it("bounds repeated result details as well as distinct sources", () => {
    const result = buildWebSearchCallRecord({
      id: "call_a",
      query: "docs",
      provider: "tavily",
      results: Array.from({ length: 60 }, () => ({
        title: "A",
        link: a.url,
        snippet: "detail",
      })),
    });
    expect(result.action.sources).toHaveLength(1);
    expect(result.results).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(isValidWebSearchCallRecord(result)).toBe(true);
  });
  it("retains original URL spelling while using normalized identity", () => {
    const result = buildWebSearchCallRecord({
      id: "call_a",
      query: "docs",
      provider: "tavily",
      results: [
        { title: "A", link: "https://EXAMPLE.com:443/a", snippet: "one" },
        { title: "A", link: a.url, snippet: "two" },
      ],
    });
    expect(result.action.sources).toHaveLength(1);
    expect(result.results.map((r) => r.url)).toEqual([
      "https://EXAMPLE.com:443/a",
      a.url,
    ]);
    expect(isValidWebSearchCallRecord(result)).toBe(true);
  });
  it("distinguishes invalid-only responses from confirmed zero hits", () => {
    const base = { id: "call_a", query: "docs", provider: "tavily" };
    const unavailable = buildWebSearchCallRecord({
      ...base,
      results: [{ title: "Bad", link: "javascript:alert(1)", snippet: "" }],
    });
    const empty = buildWebSearchCallRecord({ ...base, results: [] });
    expect(unavailable.source_details).toBe("unavailable");
    expect(unavailable.truncated).toBe(true);
    expect(empty.source_details).toBe("available");
    expect(empty.truncated).toBe(false);
    expect(isValidWebSearchCallRecord(unavailable)).toBe(true);
  });
  it("does not expose arbitrary response bodies or thrown values as error messages", () => {
    for (const thrown of [
      new Error("Tavily API 401: credential SECRET_ECHO"),
      "SECRET_ECHO",
      { toString: () => "SECRET_ECHO" },
    ]) {
      expect(JSON.stringify(classifyWebSearchError(thrown))).not.toContain(
        "SECRET_ECHO",
      );
    }
  });
});

describe("answer citation conformance", () => {
  it("requires a canonical annotation title", () => {
    const { title: _, ...noTitle } = metadata().annotations[0];
    expect(isUrlCitationAnnotation(noTitle)).toBe(false);
  });
  it.each([
    [-1, 2],
    [2, 2],
    [2, 1],
    [0.5, 2],
    [0, 4],
  ])("rejects invalid range [%s,%s) against exact text", (start_index, end_index) => {
    expect(
      isAnnotationRangeValidForText(
        { ...metadata().annotations[0], start_index, end_index },
        "abc",
      ),
    ).toBe(false);
  });
  it("requires exactly one binding per annotation", () => {
    const m = metadata();
    expect(isValidCitationContractMetadata({ ...m, bindings: [] })).toBe(false);
    expect(
      isValidCitationContractMetadata({
        ...m,
        bindings: [...m.bindings, { ...m.bindings[0], source_id: b.source_id }],
      }),
    ).toBe(false);
  });
  it("rejects one source ID bound to different URLs and the converse", () => {
    const m = metadata();
    const annotations = [
      ...m.annotations,
      {
        ...m.annotations[0],
        start_index: 4,
        end_index: 7,
        url: b.url,
        title: b.title,
      },
    ];
    expect(
      isValidCitationContractMetadata({
        ...m,
        annotations,
        bindings: [...m.bindings, { ...m.bindings[0], annotation_index: 1 }],
      }),
    ).toBe(false);
    annotations[1].url = a.url;
    expect(
      isValidCitationContractMetadata({
        ...m,
        annotations,
        bindings: [
          ...m.bindings,
          { ...m.bindings[0], annotation_index: 1, source_id: b.source_id },
        ],
      }),
    ).toBe(false);
  });
  it("rejects duplicate target/ranges while preserving different targets on one range", () => {
    const m = metadata();
    const bindings = [...m.bindings, { ...m.bindings[0], annotation_index: 1 }];
    expect(
      isValidCitationContractMetadata({
        ...m,
        annotations: [...m.annotations, m.annotations[0]],
        bindings,
      }),
    ).toBe(false);
    expect(
      isValidCitationContractMetadata({
        ...m,
        annotations: [
          ...m.annotations,
          { ...m.annotations[0], url: b.url, title: b.title },
        ],
        bindings: [m.bindings[0], { ...bindings[1], source_id: b.source_id }],
      }),
    ).toBe(true);
  });
  it("checks exact code-point ranges and authoritative sources when supplied", () => {
    const m = metadata();
    expect(
      isValidCitationContractMetadata(m, { text: "[1]", sources: [a] }),
    ).toBe(true);
    expect(
      isValidCitationContractMetadata(m, { text: "x", sources: [a] }),
    ).toBe(false);
    expect(
      isValidCitationContractMetadata(m, { text: "[1]", sources: [b] }),
    ).toBe(false);
    const emoji = {
      ...m,
      annotations: [{ ...m.annotations[0], start_index: 4, end_index: 7 }],
    };
    expect(
      isValidCitationContractMetadata(emoji, {
        text: "A😀B [1]",
        sources: [a],
      }),
    ).toBe(true);
  });
  it("preserves binding indexes through canonical projection and JSON replay", () => {
    const m = metadata();
    m.annotations = [
      { ...m.annotations[0], start_index: 9, end_index: 12 },
      { ...m.annotations[0], url: b.url, title: b.title },
    ];
    m.bindings = [
      m.bindings[0],
      { ...m.bindings[0], annotation_index: 1, source_id: b.source_id },
    ];
    const projected = projectOutputText("[2] then [1]", m.annotations);
    expect(
      projected.annotations.map((ann, i) => [ann.url, m.bindings[i].source_id]),
    ).toEqual([
      [a.url, a.source_id],
      [b.url, b.source_id],
    ]);
    expect(JSON.parse(JSON.stringify(projected))).toEqual(projected);
    projected.annotations[0].title = "Consumer copy";
    expect(m.annotations[0].title).toBe("A");
  });
  it("keeps source identities and provenance outside canonical annotations", () => {
    const extended = {
      ...metadata().annotations[0],
      source_id: a.source_id,
      origin: "provider",
      providerExtension: true,
    };
    const projected = projectOutputText("[1]", [extended]);
    expect(Object.keys(projected.annotations[0]).sort()).toEqual([
      "end_index",
      "start_index",
      "title",
      "type",
      "url",
    ]);
    expect(extended.source_id).toBe(a.source_id);
  });
  it("validates diagnostic objects instead of accepting arbitrary JSON", () => {
    expect(
      isValidCitationContractMetadata({
        ...metadata(),
        diagnostics: [null, 42],
      }),
    ).toBe(false);
    expect(
      isValidCitationContractMetadata({
        ...metadata(),
        diagnostics: [{ code: "invented", message: "x" }],
      }),
    ).toBe(false);
  });
  it("enforces the annotation budget at its exact boundary", () => {
    const m = metadata();
    m.annotations = Array.from({ length: 1000 }, (_, i) => ({
      ...m.annotations[0],
      start_index: i,
      end_index: i + 1,
    }));
    m.bindings = m.annotations.map((_, i) => ({
      ...m.bindings[0],
      annotation_index: i,
    }));
    expect(
      isValidCitationContractMetadata(m, {
        text: "x".repeat(1000),
        sources: [a],
      }),
    ).toBe(true);
    m.annotations.push({
      ...m.annotations[0],
      start_index: 1000,
      end_index: 1001,
    });
    m.bindings.push({ ...m.bindings[0], annotation_index: 1000 });
    expect(isValidCitationContractMetadata(m)).toBe(false);
  });
  it("requires partial processing when the declared text budget is exceeded", () => {
    const m = metadata();
    const text = "[1]" + "x".repeat(256000);
    expect(isValidCitationContractMetadata(m, { text })).toBe(false);
    expect(
      isValidCitationContractMetadata(
        {
          ...m,
          processing: "partial",
          diagnostics: [
            { code: "budget_exceeded", message: "Text budget exceeded." },
          ],
        },
        { text },
      ),
    ).toBe(true);
  });
});
