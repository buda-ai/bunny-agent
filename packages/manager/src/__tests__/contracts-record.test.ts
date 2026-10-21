import { describe, expect, it } from "vitest";
import {
  buildWebSearchCallRecord,
  buildWebSearchFailureRecord,
  classifyWebSearchError,
} from "../contracts/record.js";
import { isValidWebSearchCallRecord } from "../contracts/validators.js";

describe("buildWebSearchCallRecord", () => {
  it("projects raw provider results into a validated completed record", () => {
    const record = buildWebSearchCallRecord({
      id: "call_1",
      query: "example docs",
      provider: "tavily",
      results: [
        {
          title: "Documentation",
          link: "https://example.com/docs",
          snippet: "A readable description.",
        },
      ],
    });

    expect(isValidWebSearchCallRecord(record)).toBe(true);
    expect(record.status).toBe("completed");
    expect(record.source_details).toBe("available");
    expect(record.action.sources).toHaveLength(1);
    expect(record.action.sources[0].url).toBe("https://example.com/docs");
    expect(record.results[0].source_id).toBe(
      record.action.sources[0].source_id,
    );
  });

  it("produces a completed record with empty arrays for zero hits", () => {
    const record = buildWebSearchCallRecord({
      id: "call_2",
      query: "no hits",
      provider: "brave",
      results: [],
    });

    expect(isValidWebSearchCallRecord(record)).toBe(true);
    expect(record.action.sources).toEqual([]);
    expect(record.results).toEqual([]);
    expect(record.source_details).toBe("available");
  });

  it("drops unsafe URLs rather than registering them as sources", () => {
    const record = buildWebSearchCallRecord({
      id: "call_3",
      query: "mixed",
      provider: "brave",
      results: [
        { title: "Bad", link: "javascript:alert(1)", snippet: "" },
        { title: "Good", link: "https://example.com/safe", snippet: "ok" },
      ],
    });

    expect(record.action.sources).toHaveLength(1);
    expect(record.action.sources[0].url).toBe("https://example.com/safe");
  });

  it("does not report a false zero-hit result when all provider URLs are invalid", () => {
    const record = buildWebSearchCallRecord({
      id: "call_4",
      query: "all invalid",
      provider: "brave",
      results: [{ title: "Bad", link: "not a url", snippet: "" }],
    });

    expect(record.status).toBe("completed");
    expect(record.source_details).toBe("unavailable");
    expect(record.truncated).toBe(true);
    expect(record.action.sources).toEqual([]);
    expect(record.results).toEqual([]);
  });

  it("assigns one shared source_id to repeated URLs across results", () => {
    const record = buildWebSearchCallRecord({
      id: "call_5",
      query: "dup",
      provider: "tavily",
      results: [
        { title: "A", link: "https://example.com/x", snippet: "first" },
        { title: "A", link: "https://example.com/x", snippet: "second" },
      ],
    });

    expect(record.action.sources).toHaveLength(1);
    expect(record.results).toHaveLength(2);
    expect(record.results[0].source_id).toBe(record.results[1].source_id);
  });

  it("truncates sources beyond the published per-search limit and sets truncated=true", () => {
    const results = Array.from({ length: 60 }, (_, i) => ({
      title: `Result ${i}`,
      link: `https://example.com/page-${i}`,
      snippet: "x",
    }));
    const record = buildWebSearchCallRecord({
      id: "call_6",
      query: "many",
      provider: "brave",
      results,
    });

    expect(record.action.sources).toHaveLength(50);
    expect(record.results).toHaveLength(50);
    expect(record.truncated).toBe(true);
  });

  it("retains optional age and content fields", () => {
    const record = buildWebSearchCallRecord({
      id: "call_7",
      query: "age and content",
      provider: "brave",
      results: [
        {
          title: "Recent",
          link: "https://example.com/recent",
          snippet: "snippet",
          age: "1 day ago",
          content: "full page text",
        },
      ],
    });

    expect(record.results[0].age).toBe("1 day ago");
    expect(record.results[0].content).toBe("full page text");
  });
});

describe("buildWebSearchFailureRecord", () => {
  it("produces a validated failed record with unavailable detail and empty arrays", () => {
    const record = buildWebSearchFailureRecord({
      id: "call_8",
      query: "failing",
      provider: "tavily",
      error: {
        code: "rate_limit",
        message: "429 Too Many Requests",
        retryable: true,
      },
    });

    expect(isValidWebSearchCallRecord(record)).toBe(true);
    expect(record.status).toBe("failed");
    expect(record.source_details).toBe("unavailable");
    expect(record.action.sources).toEqual([]);
    expect(record.results).toEqual([]);
    expect(record.error?.code).toBe("rate_limit");
  });
});

describe("classifyWebSearchError", () => {
  it("classifies a 401 as authentication, non-retryable", () => {
    const error = classifyWebSearchError(
      new Error("Brave API 401: Unauthorized"),
    );
    expect(error.code).toBe("authentication");
    expect(error.retryable).toBe(false);
  });

  it("classifies a 429 as rate_limit, retryable", () => {
    const error = classifyWebSearchError(
      new Error("Tavily API 429: Too Many Requests"),
    );
    expect(error.code).toBe("rate_limit");
    expect(error.retryable).toBe(true);
  });

  it("classifies a 400 as invalid_request, non-retryable", () => {
    const error = classifyWebSearchError(
      new Error("Tavily API 400: Bad Request"),
    );
    expect(error.code).toBe("invalid_request");
    expect(error.retryable).toBe(false);
  });

  it("classifies a network TypeError as network, retryable", () => {
    const error = classifyWebSearchError(new TypeError("fetch failed"));
    expect(error.code).toBe("network");
    expect(error.retryable).toBe(true);
  });

  it("classifies a nested ETIMEDOUT cause as network, retryable", () => {
    const cause = Object.assign(new Error("connect ETIMEDOUT"), {
      code: "ETIMEDOUT",
    });
    const fetchError = Object.assign(new TypeError("fetch failed"), { cause });
    const error = classifyWebSearchError(fetchError);
    expect(error.code).toBe("network");
    expect(error.retryable).toBe(true);
  });

  it("classifies an unrecognized error as provider_error, non-retryable", () => {
    const error = classifyWebSearchError(new Error("something unexpected"));
    expect(error.code).toBe("provider_error");
    expect(error.retryable).toBe(false);
  });

  it("never includes the raw error object's extra fields, only a message string", () => {
    const secretish = Object.assign(new Error("Brave API 401: Unauthorized"), {
      apiKey: "bsk-should-not-leak",
    });
    const error = classifyWebSearchError(secretish);
    expect(JSON.stringify(error)).not.toContain("bsk-should-not-leak");
  });
});
