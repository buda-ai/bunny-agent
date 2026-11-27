import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { describe, expect, it } from "vitest";
import {
  parseModelSpec,
  resolveDynamicModelProfile,
  resolveDynamicModelRegistration,
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
  const geminiFlashProfile = {
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      xhigh: null,
      max: null,
    },
  };

  it.each([
    "gemini-3.7-flash",
    "gemini-3.8-flash",
  ])("uses the same published Flash profile for %s", (modelName) => {
    expect(resolveDynamicModelProfile(modelName)).toEqual(geminiFlashProfile);
  });

  it.each([
    "GEMINI-3.7-FLASH",
    "GEMINI-3.8-FLASH",
  ])("matches %s case-insensitively", (modelName) => {
    expect(resolveDynamicModelProfile(modelName)).toEqual(geminiFlashProfile);
  });

  it("retains the generic profile for unknown aliases", () => {
    expect(resolveDynamicModelProfile("custom-model")).toEqual({
      contextWindow: 200_000,
      maxTokens: 64_000,
      reasoning: false,
      thinkingLevelMap: { off: null, xhigh: "xhigh" },
    });
    expect(resolveDynamicModelProfile("custom-model", "high").reasoning).toBe(
      true,
    );
  });
});

describe("resolveDynamicModelRegistration", () => {
  it.each([
    "gpt-6.2-sol",
    "gpt-6.2-astra",
  ])("keeps %s on the Responses API with full GPT-6 limits", (modelName) => {
    const registration = resolveDynamicModelRegistration(modelName, "high");

    expect(registration.api).toBe("openai-responses");
    expect(registration.profile).toEqual({
      contextWindow: 272_000,
      maxTokens: 128_000,
      reasoning: true,
      thinkingLevelMap: {
        off: "none",
        minimal: null,
        low: "low",
        medium: "medium",
        high: "high",
        xhigh: "xhigh",
        max: "max",
      },
    });
    expect(registration.compat).toEqual({
      supportsStrictMode: true,
      supportsOpenAIGrammarTools: true,
      supportsAdditionalTools: true,
      supportsToolSearch: true,
      supportsMidConvoSystemMessages: true,
      supportsExplicitPromptCacheMode: true,
      supportsMidConvoEffort: true,
    });
  });

  it("matches the GPT-6.2 ids case-insensitively", () => {
    expect(resolveDynamicModelRegistration("GPT-6.2-SOL").api).toBe(
      "openai-responses",
    );
  });

  it("defaults unknown models to Chat Completions with session affinity", () => {
    const registration = resolveDynamicModelRegistration("custom-model");

    expect(registration.api).toBe("openai-completions");
    expect(registration.profile).toEqual({
      contextWindow: 200_000,
      maxTokens: 64_000,
      reasoning: false,
      thinkingLevelMap: { off: null, xhigh: "xhigh" },
    });
    // Without the affinity headers a gateway cannot route every turn of a
    // session to the replica that holds its prompt cache.
    expect(registration.compat).toEqual({ sendSessionAffinityHeaders: true });
  });

  it("lets PI_DYNAMIC_MODEL_API pick the endpoint for a dynamic model", () => {
    const registration = resolveDynamicModelRegistration(
      "custom-model",
      "high",
      {
        PI_DYNAMIC_MODEL_API: "openai-responses",
      },
    );

    expect(registration.api).toBe("openai-responses");
    expect(registration.compat).toBeUndefined();
  });

  it("drops Responses-only compat when an override picks Chat Completions", () => {
    const registration = resolveDynamicModelRegistration(
      "gpt-6.2-sol",
      "high",
      {
        PI_DYNAMIC_MODEL_API: "openai-completions",
      },
    );

    expect(registration.api).toBe("openai-completions");
    expect(registration.compat).toEqual({ sendSessionAffinityHeaders: true });
  });

  it("ignores an unsupported PI_DYNAMIC_MODEL_API value", () => {
    const registration = resolveDynamicModelRegistration(
      "custom-model",
      "high",
      {
        PI_DYNAMIC_MODEL_API: "grpc",
      },
    );

    expect(registration.api).toBe("openai-completions");
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

describe("pi-ai built-in catalog", () => {
  const lookup = getBuiltinModel as (
    provider: string,
    modelId: string,
  ) => { api: string; contextWindow: number; maxTokens: number } | undefined;

  // A renamed model missing from the catalog is what silently downgraded the
  // GPT-6.2 flagships to /v1/chat/completions (no session affinity, no
  // prompt_cache_key, 200k/64k caps). They must resolve as built-ins.
  it.each([
    "gpt-6.2-sol",
    "gpt-6.2-astra",
  ])("resolves %s as a built-in Responses model", (modelId) => {
    const model = lookup("openai", modelId);

    expect(model?.api).toBe("openai-responses");
    expect(model?.contextWindow).toBe(272_000);
    expect(model?.maxTokens).toBe(128_000);
  });
});
