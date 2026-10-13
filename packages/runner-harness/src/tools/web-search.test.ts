import { afterEach, describe, expect, it } from "vitest";
import { resolveSearchProviders } from "./web-search.js";

describe("resolveSearchProviders", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses explicitly provided web search keys", () => {
    const providers = resolveSearchProviders({
      BRAVE_API_KEY: "request-brave",
      TAVILY_API_KEY: "request-tavily",
    });

    expect(providers.map(({ provider }) => provider.id)).toEqual([
      "brave",
      "tavily",
    ]);
    expect(providers.map(({ url }) => url)).toEqual([
      "https://api.search.brave.com/res/v1/web/search",
      "https://api.tavily.com/search",
    ]);
  });

  it("honours search URL overrides", () => {
    const providers = resolveSearchProviders({
      BRAVE_API_KEY: "request-brave",
      TAVILY_API_KEY: "request-tavily",
      BRAVE_SEARCH_URL: "https://search.internal.example/brave",
      TAVILY_SEARCH_URL: "https://search.internal.example/tavily",
    });

    expect(providers.map(({ url }) => url)).toEqual([
      "https://search.internal.example/brave",
      "https://search.internal.example/tavily",
    ]);
  });

  it("ignores web search keys from process.env", () => {
    process.env.BRAVE_API_KEY = "local-brave";
    process.env.TAVILY_API_KEY = "local-tavily";

    expect(resolveSearchProviders({})).toEqual([]);
  });
});
