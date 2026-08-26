import { describe, expect, it } from "vitest";
import {
  parseModelSpec,
  resolveDynamicModelProfile,
  resolveImageModelName,
  resolveInitialThinkingLevel,
} from "../pi-runner.js";

describe("parseModelSpec", () => {
  it("parses standard provider:model format", () => {
    expect(parseModelSpec("openai:gpt-4o")).toEqual({
      provider: "openai",
      modelName: "gpt-4o",
    });
  });

  it("parses google provider", () => {
    expect(parseModelSpec("google:gemini-2.5-pro")).toEqual({
      provider: "google",
      modelName: "gemini-2.5-pro",
    });
  });

  it("preserves slashes in model name (LLM gateway routing)", () => {
    expect(parseModelSpec("openai:openai/gpt-4o")).toEqual({
      provider: "openai",
      modelName: "openai/gpt-4o",
    });
  });

  it("throws on missing colon", () => {
    expect(() => parseModelSpec("gpt-4o")).toThrow(/Expected format/);
  });

  it("throws on empty provider", () => {
    expect(() => parseModelSpec(":gpt-4o")).toThrow(/Expected format/);
  });

  it("throws on empty model name", () => {
    expect(() => parseModelSpec("openai:")).toThrow(/Expected format/);
  });

  it("trims whitespace", () => {
    expect(parseModelSpec("  openai:gpt-4o  ")).toEqual({
      provider: "openai",
      modelName: "gpt-4o",
    });
  });
});

describe("resolveDynamicModelProfile", () => {
  it("uses the published Gemini 3.7 Flash limits", () => {
    expect(resolveDynamicModelProfile("gemini-3.7-flash")).toEqual({
      contextWindow: 1_048_576,
      maxTokens: 65_536,
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        xhigh: null,
        max: null,
      },
    });
  });

  it("matches known model aliases case-insensitively", () => {
    expect(resolveDynamicModelProfile("GEMINI-3.7-FLASH")).toEqual({
      contextWindow: 1_048_576,
      maxTokens: 65_536,
      reasoning: true,
      thinkingLevelMap: {
        off: null,
        minimal: null,
        xhigh: null,
        max: null,
      },
    });
  });

  it("retains the generic profile for unknown aliases", () => {
    expect(resolveDynamicModelProfile("custom-model")).toEqual({
      contextWindow: 128_000,
      maxTokens: 8_192,
      reasoning: false,
      thinkingLevelMap: { off: null, xhigh: "xhigh" },
    });
    expect(resolveDynamicModelProfile("custom-model", "high").reasoning).toBe(
      true,
    );
  });
});

describe("resolveInitialThinkingLevel", () => {
  const currentModel = { id: "gemini-3.7-flash", provider: "openai" } as const;

  it("uses the new model default when resuming with a different model", () => {
    expect(
      resolveInitialThinkingLevel(
        undefined,
        { provider: "openai", modelId: "gemini-3.1-pro" },
        currentModel,
      ),
    ).toBe("medium");
  });

  it("preserves Pi session restoration for the same model", () => {
    expect(
      resolveInitialThinkingLevel(
        undefined,
        { provider: "openai", modelId: "gemini-3.7-flash" },
        currentModel,
      ),
    ).toBeUndefined();
  });

  it("keeps an explicit effort when switching models", () => {
    expect(
      resolveInitialThinkingLevel(
        "high",
        { provider: "openai", modelId: "gemini-3.1-pro" },
        currentModel,
      ),
    ).toBe("high");
  });
});

describe("resolveImageModelName", () => {
  it("returns image model name when provider matches", () => {
    expect(
      resolveImageModelName("openai", {
        IMAGE_GENERATION_MODEL: "openai:gpt-image-1",
      }),
    ).toBe("gpt-image-1");
  });

  it("returns undefined when provider does not match", () => {
    expect(
      resolveImageModelName("openai", {
        IMAGE_GENERATION_MODEL: "gemini:imagen-3",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when IMAGE_GENERATION_MODEL is not set", () => {
    expect(resolveImageModelName("openai", {})).toBeUndefined();
  });

  it("returns undefined when env is undefined", () => {
    expect(resolveImageModelName("openai", undefined)).toBeUndefined();
  });

  it("returns undefined when IMAGE_GENERATION_MODEL is invalid format", () => {
    expect(
      resolveImageModelName("openai", { IMAGE_GENERATION_MODEL: "invalid" }),
    ).toBeUndefined();
  });

  it("works with LLM gateway-style model names", () => {
    expect(
      resolveImageModelName("openai", {
        IMAGE_GENERATION_MODEL: "openai:gemini-3-pro-image",
      }),
    ).toBe("gemini-3-pro-image");
  });
});
