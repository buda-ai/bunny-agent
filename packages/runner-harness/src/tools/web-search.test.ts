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
  });

  it("ignores web search keys from process.env", () => {
    process.env.BRAVE_API_KEY = "local-brave";
    process.env.TAVILY_API_KEY = "local-tavily";

    expect(resolveSearchProviders({})).toEqual([]);
  });
});
