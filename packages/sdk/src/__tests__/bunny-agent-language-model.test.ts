import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { resolveRequestAllowedTools } from "../provider/bunny-agent-language-model";

describe("resolveRequestAllowedTools", () => {
  it("uses defaults when streamText tools are not provided", () => {
    const allowedTools = resolveRequestAllowedTools(
      { prompt: [] } as LanguageModelV3CallOptions,
      ["bash", "read"],
    );

    expect(allowedTools).toEqual(["bash", "read"]);
  });

  it("uses streamText tools names when provided", () => {
    const allowedTools = resolveRequestAllowedTools(
      {
        prompt: [],
        tools: [
          {
            type: "function",
            name: "custom_tool",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      } as LanguageModelV3CallOptions,
      ["bash"],
    );

    expect(allowedTools).toEqual(["custom_tool"]);
  });

  it("deduplicates and trims tool names from streamText tools", () => {
    const allowedTools = resolveRequestAllowedTools(
      {
        prompt: [],
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
      } as LanguageModelV3CallOptions,
      undefined,
    );

    expect(allowedTools).toEqual(["bash", "read"]);
  });

  it("returns an empty list when streamText tools is explicitly empty", () => {
    const allowedTools = resolveRequestAllowedTools(
      { prompt: [], tools: [] } as LanguageModelV3CallOptions,
      ["bash"],
    );

    expect(allowedTools).toEqual([]);
  });
});
