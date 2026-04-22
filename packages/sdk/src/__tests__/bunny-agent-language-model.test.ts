import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import type { RunnerSpec, SandboxAdapter } from "@bunny-agent/manager";
import { describe, expect, it } from "vitest";
import { BunnyAgentLanguageModel } from "../provider/bunny-agent-language-model";
import type { BunnyAgentProviderSettings } from "../provider/types";

function createModel(
  options: Partial<BunnyAgentProviderSettings> & { runner?: RunnerSpec } = {},
) {
  const modelId = "sonnet";
  const settings: BunnyAgentProviderSettings & { runner: RunnerSpec } = {
    sandbox: {} as SandboxAdapter,
    logger: false,
    runner: {
      model: modelId,
      outputFormat: "stream",
      ...(options.runner ?? {}),
    },
    ...options,
  };

  return new BunnyAgentLanguageModel({
    id: modelId,
    options: settings,
  });
}

function resolveAllowedTools(
  model: BunnyAgentLanguageModel,
  options: Partial<LanguageModelV3CallOptions>,
) {
  return (
    model as unknown as {
      resolveAllowedTools: (value: LanguageModelV3CallOptions) =>
        | string[]
        | undefined;
    }
  ).resolveAllowedTools({
    prompt: [],
    ...options,
  });
}

describe("BunnyAgentLanguageModel tools resolution", () => {
  it("uses provider defaults when streamText tools are not provided", () => {
    const model = createModel({
      runner: {
        model: "sonnet",
        outputFormat: "stream",
        allowedTools: ["bash", "read"],
      },
    });

    const allowedTools = resolveAllowedTools(model, {});

    expect(allowedTools).toEqual(["bash", "read"]);
  });

  it("uses streamText tools names when provided", () => {
    const model = createModel({
      runner: {
        model: "sonnet",
        outputFormat: "stream",
        allowedTools: ["bash"],
      },
    });

    const allowedTools = resolveAllowedTools(model, {
      tools: [
        {
          type: "function",
          name: "custom_tool",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });

    expect(allowedTools).toEqual(["custom_tool"]);
  });

  it("deduplicates and trims tool names from streamText tools", () => {
    const model = createModel();

    const allowedTools = resolveAllowedTools(model, {
      tools: [
        {
          type: "function",
          name: "  bash  ",
          inputSchema: { type: "object", properties: {} },
        },
        {
          type: "provider",
          id: "bunny.read",
          name: "read",
          args: {},
        },
        {
          type: "function",
          name: "bash",
          inputSchema: { type: "object", properties: {} },
        },
        {
          type: "function",
          name: "   ",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });

    expect(allowedTools).toEqual(["bash", "read"]);
  });

  it("returns an empty list when streamText tools is explicitly empty", () => {
    const model = createModel({
      runner: {
        model: "sonnet",
        outputFormat: "stream",
        allowedTools: ["bash"],
      },
    });

    const allowedTools = resolveAllowedTools(model, { tools: [] });

    expect(allowedTools).toEqual([]);
  });
});
