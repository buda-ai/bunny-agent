import { describe, expect, it } from "vitest";
import { getBunnyAgentMetadata, getBunnyAgentUsage } from "../provider/usage";

describe("usage helpers", () => {
  it("extracts bunny-agent metadata", () => {
    const providerMetadata = {
      "bunny-agent": {
        sessionId: "session-1",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 3,
          cache_creation_input_tokens: 1,
        },
      },
    };

    expect(getBunnyAgentMetadata(providerMetadata)).toEqual(
      providerMetadata["bunny-agent"],
    );
  });

  it("extracts bunny-agent usage", () => {
    const providerMetadata = {
      "bunny-agent": {
        model: { provider: "openai", modelId: "gemini-3.1-pro" },
        webSearchUsage: { requests: 1, fetched_pages: 0 },
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 3,
          cache_creation_input_tokens: 1,
        },
      },
    };

    expect(getBunnyAgentUsage(providerMetadata)).toEqual({
      inputTokens: {
        total: 14,
        noCache: 10,
        cacheRead: 3,
        cacheWrite: 1,
      },
      outputTokens: {
        total: 5,
      },
      raw: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 1,
        model: { provider: "openai", modelId: "gemini-3.1-pro" },
        webSearchUsage: { requests: 1, fetched_pages: 0 },
      },
    });
  });

  it("returns undefined for invalid metadata payloads", () => {
    expect(getBunnyAgentMetadata(undefined)).toBeUndefined();
    expect(getBunnyAgentMetadata({})).toBeUndefined();
    expect(getBunnyAgentUsage({ "bunny-agent": {} })).toBeUndefined();
    expect(
      getBunnyAgentUsage({ "bunny-agent": { usage: "invalid" } }),
    ).toBeUndefined();
  });
});
