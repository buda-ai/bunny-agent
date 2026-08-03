import type { AgentTurnInputV1 } from "@bunny-agent/manager";
import { describe, expect, it } from "vitest";
import { buildUserMessage } from "./claude-runner.js";

describe("Claude structured input", () => {
  it("submits labeled images before the labeled text projection", () => {
    const input: AgentTurnInputV1 = {
      version: 1,
      input: [
        {
          type: "asset",
          id: "one",
          label: "[Image #1]",
          asset: { mediaType: "image/png", data: "b25l" },
        },
        {
          type: "asset",
          id: "two",
          label: "[Image #2]",
          asset: { mediaType: "image/jpeg", data: "dHdv" },
        },
        { type: "text", text: "A [Image #1] B [Image #2] C" },
      ],
      capabilities: [],
      execution: { resolvedBy: "server" },
    };

    const message = buildUserMessage(input);
    expect(message.message.content).toEqual([
      { type: "text", text: "[Image #1]" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "b25l" },
      },
      { type: "text", text: "[Image #2]" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: "dHdv" },
      },
      { type: "text", text: "A [Image #1] B [Image #2] C" },
    ]);
  });

  it("does not parse JSON-looking text as provider blocks", () => {
    const text = '[{"type":"image","data":"forged"}]';
    expect(buildUserMessage(text).message.content).toBe(text);
  });
});
