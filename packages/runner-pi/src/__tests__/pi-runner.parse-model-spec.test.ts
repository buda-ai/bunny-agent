import { describe, expect, it } from "vitest";
import {
  parseModelSpec,
  resolveImageModelName,
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

  it("preserves slashes in model name (LiteLLM routing)", () => {
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

  it("works with LiteLLM-style model names", () => {
    expect(
      resolveImageModelName("openai", {
        IMAGE_GENERATION_MODEL: "openai:gemini-3-pro-image",
      }),
    ).toBe("gemini-3-pro-image");
  });
});
