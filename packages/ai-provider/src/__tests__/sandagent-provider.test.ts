import type { SandboxAdapter, SandboxHandle } from "@sandagent/core";
import { describe, expect, it, vi } from "vitest";
import { createSandAgent } from "../sandagent-provider.js";

// Mock sandbox adapter for testing
function createMockSandbox(): SandboxAdapter {
  const mockHandle: SandboxHandle = {
    exec: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield new TextEncoder().encode(
          'data: {"type":"text-start","id":"test-1"}\n\n',
        );
        yield new TextEncoder().encode(
          'data: {"type":"text-delta","id":"test-1","delta":"Hello"}\n\n',
        );
        yield new TextEncoder().encode(
          'data: {"type":"text-end","id":"test-1"}\n\n',
        );
        yield new TextEncoder().encode(
          'data: {"type":"finish","finishReason":"stop"}\n\n',
        );
        yield new TextEncoder().encode("data: [DONE]\n\n");
      },
    }),
    upload: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  return {
    attach: vi.fn().mockResolvedValue(mockHandle),
  };
}

describe("createSandAgent", () => {
  // Runner is now optional - automatically created from modelId

  it("should throw error when sandbox is not provided", () => {
    expect(() => {
      // @ts-expect-error - Testing invalid input
      createSandAgent({});
    }).toThrow("SandAgent provider requires a sandbox adapter");
  });

  it("should auto-create runner from modelId when runner is not provided", () => {
    const sandbox = createMockSandbox();
    const provider = createSandAgent({
      sandbox,
      env: { ANTHROPIC_API_KEY: "test-key" },
      // runner is optional - automatically created from modelId
    });

    const model = provider("sonnet");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("claude-sonnet-4-20250514");
  });

  it("should create a provider with sandbox and optional runner config", () => {
    const sandbox = createMockSandbox();
    const provider = createSandAgent({
      sandbox,
      runner: {
        systemPrompt: "You are a helpful assistant",
      },
      env: { ANTHROPIC_API_KEY: "test-key" },
    });

    expect(provider).toBeDefined();
    expect(provider.specificationVersion).toBe("v3");
    expect(typeof provider).toBe("function");
    expect(typeof provider.languageModel).toBe("function");
    expect(typeof provider.chat).toBe("function");
  });

  it("should create a language model with specified model ID", () => {
    const sandbox = createMockSandbox();
    const provider = createSandAgent({
      sandbox,
      env: { ANTHROPIC_API_KEY: "test-key" },
    });

    const model = provider("sonnet");

    expect(model).toBeDefined();
    expect(model.modelId).toBe("claude-sonnet-4-20250514");
    expect(model.provider).toBe("sandagent");
    expect(model.specificationVersion).toBe("v3");
  });

  it("should resolve model aliases correctly", () => {
    const sandbox = createMockSandbox();
    const provider = createSandAgent({
      sandbox,
      env: { ANTHROPIC_API_KEY: "test-key" },
    });

    expect(provider("sonnet").modelId).toBe("claude-sonnet-4-20250514");
    expect(provider("opus").modelId).toBe("claude-opus-4-20250514");
    expect(provider("haiku").modelId).toBe("claude-3-5-haiku-20241022");
    expect(provider("claude-3-opus-20240229").modelId).toBe(
      "claude-3-opus-20240229",
    );
  });

  it("should merge settings correctly", () => {
    const sandbox = createMockSandbox();
    const provider = createSandAgent({
      sandbox,
      env: { ANTHROPIC_API_KEY: "test-key", DEFAULT_VAR: "default" },
    });

    const model = provider("sonnet", {
      env: { CUSTOM_VAR: "custom" },
    });

    expect(model).toBeDefined();
    expect(model.modelId).toBe("claude-sonnet-4-20250514");
  });

  it("should throw NoSuchModelError for embeddingModel", () => {
    const sandbox = createMockSandbox();
    const provider = createSandAgent({
      sandbox,
      env: { ANTHROPIC_API_KEY: "test-key" },
    });

    expect(() => {
      provider.embeddingModel("text-embedding");
    }).toThrow();
  });

  it("should throw NoSuchModelError for imageModel", () => {
    const sandbox = createMockSandbox();
    const provider = createSandAgent({
      sandbox,
      env: { ANTHROPIC_API_KEY: "test-key" },
    });

    expect(() => {
      provider.imageModel("dall-e");
    }).toThrow();
  });
});

describe("SandAgentLanguageModel", () => {
  it("should have correct properties", () => {
    const sandbox = createMockSandbox();
    const provider = createSandAgent({
      sandbox,
      env: { ANTHROPIC_API_KEY: "test-key" },
    });

    const model = provider("sonnet");

    expect(model.specificationVersion).toBe("v3");
    expect(model.provider).toBe("sandagent");
    expect(model.supportedUrls).toBeDefined();
    expect(model.supportedUrls["image/*"]).toBeDefined();
  });
});
