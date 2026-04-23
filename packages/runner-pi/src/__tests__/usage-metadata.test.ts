import { describe, expect, it } from "vitest";
import {
  accumulateToolUsage,
  getUsageFromAgentEndMessages,
  usageToMessageMetadata,
} from "../usage-metadata.js";

describe("usageToMessageMetadata", () => {
  it("maps pi-ai Usage to snake_case token fields", () => {
    const usage = {
      input: 100,
      output: 50,
      cacheRead: 10,
      cacheWrite: 5,
      totalTokens: 165,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    expect(usageToMessageMetadata(usage)).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 10,
      cache_creation_input_tokens: 5,
    });
  });
});

describe("accumulateToolUsage", () => {
  it("adds a new key when tally is empty", () => {
    const tally: Record<string, Record<string, number>> = {};
    accumulateToolUsage(tally, {
      "gpt-image-1": { input_tokens: 22, output_tokens: 1120 },
    });
    expect(tally).toEqual({
      "gpt-image-1": { input_tokens: 22, output_tokens: 1120 },
    });
  });

  it("sums values when the same key appears again", () => {
    const tally: Record<string, Record<string, number>> = {
      brave: { requests: 1, fetchedPages: 2 },
    };
    accumulateToolUsage(tally, {
      brave: { requests: 3, fetchedPages: 1 },
    });
    expect(tally).toEqual({
      brave: { requests: 4, fetchedPages: 3 },
    });
  });

  it("handles multiple keys in one call", () => {
    const tally: Record<string, Record<string, number>> = {};
    accumulateToolUsage(tally, {
      brave: { requests: 1, fetchedPages: 0 },
      "gpt-image-1": { input_tokens: 10, output_tokens: 100 },
    });
    expect(tally).toEqual({
      brave: { requests: 1, fetchedPages: 0 },
      "gpt-image-1": { input_tokens: 10, output_tokens: 100 },
    });
  });

  it("ignores non-numeric fields in raw rows", () => {
    const tally: Record<string, Record<string, number>> = {};
    accumulateToolUsage(tally, {
      provider: { requests: 1, label: "test" as unknown as number },
    });
    expect(tally).toEqual({ provider: { requests: 1 } });
  });
});

describe("getUsageFromAgentEndMessages", () => {
  it("returns undefined when no assistant messages have usage", () => {
    expect(getUsageFromAgentEndMessages([{ role: "user" }])).toBeUndefined();
    expect(getUsageFromAgentEndMessages([])).toBeUndefined();
  });

  it("returns usage from a single assistant message", () => {
    const result = getUsageFromAgentEndMessages([
      {
        role: "assistant",
        usage: {
          input: 10,
          output: 20,
          cacheRead: 1,
          cacheWrite: 2,
          totalTokens: 33,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      },
    ]);
    expect(result?.input).toBe(10);
    expect(result?.output).toBe(20);
    expect(result?.cacheRead).toBe(1);
    expect(result?.cacheWrite).toBe(2);
    expect(result?.totalTokens).toBe(33);
  });

  it("returns last assistant usage (not summed) across multiple turns", () => {
    const result = getUsageFromAgentEndMessages([
      {
        role: "assistant",
        usage: {
          input: 10,
          output: 20,
          cacheRead: 1,
          cacheWrite: 2,
          totalTokens: 33,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      },
      { role: "user" },
      {
        role: "assistant",
        usage: {
          input: 30,
          output: 40,
          cacheRead: 3,
          cacheWrite: 4,
          totalTokens: 77,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      },
    ]);
    expect(result?.input).toBe(30);
    expect(result?.output).toBe(40);
    expect(result?.cacheRead).toBe(3);
    expect(result?.cacheWrite).toBe(4);
    expect(result?.totalTokens).toBe(77);
  });

  it("skips assistant messages without usage", () => {
    const result = getUsageFromAgentEndMessages([
      { role: "assistant" },
      {
        role: "assistant",
        usage: {
          input: 5,
          output: 10,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      },
    ]);
    expect(result?.input).toBe(5);
    expect(result?.output).toBe(10);
  });
});
