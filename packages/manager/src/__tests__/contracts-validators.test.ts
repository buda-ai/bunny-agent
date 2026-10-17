import { describe, expect, it } from "vitest";
import {
  isSupportedSearchContractVersion,
  isUrlCitationAnnotation,
  isValidCitationContractMetadata,
  isValidWebSearchCallRecord,
} from "../contracts/index.js";
import type { WebSearchCallRecord } from "../contracts/types.js";

const completedExample: WebSearchCallRecord = {
  schema_version: 1,
  type: "web_search_call",
  id: "call_search_1",
  status: "completed",
  action: {
    type: "search",
    query: "example documentation",
    sources: [
      {
        type: "url",
        source_id: "src_docs",
        url: "https://example.com/docs",
        title: "Documentation",
      },
    ],
  },
  source_details: "available",
  results: [
    {
      source_id: "src_docs",
      url: "https://example.com/docs",
      title: "Documentation",
      snippet: "A readable description.",
    },
  ],
  provider: "tavily",
  truncated: false,
};

describe("isValidWebSearchCallRecord", () => {
  it("accepts the design doc's canonical completed example", () => {
    expect(isValidWebSearchCallRecord(completedExample)).toBe(true);
  });

  it("accepts a confirmed empty result set as available/zero sources", () => {
    const empty: WebSearchCallRecord = {
      ...completedExample,
      action: { type: "search", query: "no hits", sources: [] },
      results: [],
    };
    expect(isValidWebSearchCallRecord(empty)).toBe(true);
  });

  it("accepts a query-only unavailable-detail envelope", () => {
    const queryOnly: WebSearchCallRecord = {
      schema_version: 1,
      type: "web_search_call",
      id: "call_search_2",
      status: "completed",
      action: { type: "search", query: "codex query", sources: [] },
      source_details: "unavailable",
      results: [],
      provider: "codex",
      truncated: false,
    };
    expect(isValidWebSearchCallRecord(queryOnly)).toBe(true);
  });

  it("accepts a failed envelope with a sanitized error", () => {
    const failed: WebSearchCallRecord = {
      schema_version: 1,
      type: "web_search_call",
      id: "call_search_3",
      status: "failed",
      action: { type: "search", query: "auth failure", sources: [] },
      source_details: "unavailable",
      results: [],
      provider: "tavily",
      truncated: false,
      error: {
        code: "authentication",
        message: "Invalid API key.",
        retryable: false,
      },
    };
    expect(isValidWebSearchCallRecord(failed)).toBe(true);
  });

  it("rejects a malformed schema_version", () => {
    const malformed = { ...completedExample, schema_version: 2 };
    expect(isValidWebSearchCallRecord(malformed)).toBe(false);
  });

  it("rejects unavailable detail that still reports sources", () => {
    const contradictory = {
      ...completedExample,
      source_details: "unavailable" as const,
    };
    expect(isValidWebSearchCallRecord(contradictory)).toBe(false);
  });

  it("rejects a failed status carrying purported successful results", () => {
    const contradictory = {
      ...completedExample,
      status: "failed" as const,
      error: {
        code: "provider_error" as const,
        message: "boom",
        retryable: true,
      },
    };
    expect(isValidWebSearchCallRecord(contradictory)).toBe(false);
  });

  it("rejects a result whose source_id is not declared in action.sources", () => {
    const orphanResult = {
      ...completedExample,
      results: [
        {
          source_id: "src_unknown",
          url: "https://example.com/other",
        },
      ],
    };
    expect(isValidWebSearchCallRecord(orphanResult)).toBe(false);
  });

  it("rejects an unsafe source URL (credentials embedded)", () => {
    const unsafe = {
      ...completedExample,
      action: {
        type: "search" as const,
        query: "example documentation",
        sources: [
          {
            type: "url" as const,
            source_id: "src_docs",
            url: "https://user:pass@example.com/docs",
          },
        ],
      },
    };
    expect(isValidWebSearchCallRecord(unsafe)).toBe(false);
  });
});

describe("isSupportedSearchContractVersion", () => {
  it("accepts version 1", () => {
    expect(isSupportedSearchContractVersion(1)).toBe(true);
  });

  it("rejects an unsupported version", () => {
    expect(isSupportedSearchContractVersion(2)).toBe(false);
    expect(isSupportedSearchContractVersion("1")).toBe(false);
    expect(isSupportedSearchContractVersion(undefined)).toBe(false);
  });
});

describe("isUrlCitationAnnotation", () => {
  it("accepts the design doc's canonical annotation example", () => {
    expect(
      isUrlCitationAnnotation({
        type: "url_citation",
        start_index: 25,
        end_index: 28,
        url: "https://example.com/docs",
        title: "Documentation",
      }),
    ).toBe(true);
  });

  it("rejects end_index <= start_index", () => {
    expect(
      isUrlCitationAnnotation({
        type: "url_citation",
        start_index: 5,
        end_index: 5,
        url: "https://example.com/docs",
      }),
    ).toBe(false);
  });

  it("rejects an unsafe url", () => {
    expect(
      isUrlCitationAnnotation({
        type: "url_citation",
        start_index: 0,
        end_index: 3,
        url: "javascript:alert(1)",
      }),
    ).toBe(false);
  });
});

describe("isValidCitationContractMetadata", () => {
  it("accepts the design doc's terminal text-end metadata example", () => {
    expect(
      isValidCitationContractMetadata({
        schema_version: 1,
        offset_unit: "unicode-code-points",
        annotations: [],
        bindings: [],
        processing: "complete",
      }),
    ).toBe(true);
  });

  it("rejects a binding whose annotation_index is out of range", () => {
    expect(
      isValidCitationContractMetadata({
        schema_version: 1,
        offset_unit: "unicode-code-points",
        annotations: [],
        bindings: [
          {
            annotation_index: 0,
            source_id: "src_docs",
            origin: "provider",
            tool_call_ids: [],
          },
        ],
        processing: "complete",
      }),
    ).toBe(false);
  });

  it("rejects an unknown offset unit", () => {
    expect(
      isValidCitationContractMetadata({
        schema_version: 1,
        offset_unit: "utf-16",
        annotations: [],
        bindings: [],
        processing: "complete",
      }),
    ).toBe(false);
  });
});
