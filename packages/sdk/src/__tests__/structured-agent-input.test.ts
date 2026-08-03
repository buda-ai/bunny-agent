import { describe, expect, it } from "vitest";
import { compileMessagesToAgentInput } from "../provider/bunny-agent-language-model";

describe("AI SDK structured agent input", () => {
  it("keeps prose and two image labels associated in source order", async () => {
    const turn = await compileMessagesToAgentInput(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "before " },
            {
              type: "image",
              mimeType: "image/png",
              data: "data:image/png;base64,b25l",
            },
            { type: "text", text: " between " },
            {
              type: "image",
              mimeType: "image/jpeg",
              data: "data:image/jpeg;base64,dHdv",
            },
            { type: "text", text: " after" },
          ],
        },
      ],
      false,
    );

    expect(turn.input).toEqual([
      {
        type: "asset",
        id: "image-1",
        label: "[Image #1]",
        asset: { mediaType: "image/png", data: "b25l" },
      },
      {
        type: "asset",
        id: "image-2",
        label: "[Image #2]",
        asset: { mediaType: "image/jpeg", data: "dHdv" },
      },
      {
        type: "text",
        text: "before [Image #1] between [Image #2] after",
      },
    ]);
  });

  it("retains prior text and images only for fresh sessions", async () => {
    const messages = [
      {
        role: "user" as const,
        content: [
          { type: "image" as const, mimeType: "image/png", data: "b2xk" },
          { type: "text" as const, text: " old" },
        ],
      },
      { role: "assistant" as const, content: "answer" },
      { role: "user" as const, content: "new" },
    ];

    const fresh = await compileMessagesToAgentInput(messages, true);
    const resumed = await compileMessagesToAgentInput(messages, false);
    expect(fresh.input.some((part) => part.type === "asset")).toBe(true);
    expect(resumed.input).toEqual([{ type: "text", text: "new" }]);
  });

  it("does not duplicate a composer-provided frozen image label", async () => {
    const turn = await compileMessagesToAgentInput(
      [
        {
          role: "user",
          content: [
            { type: "text", text: "before [Image #1]" },
            { type: "image", mimeType: "image/png", data: "b25l" },
            { type: "text", text: " after" },
          ],
        },
      ],
      false,
    );

    expect(turn.input.at(-1)).toEqual({
      type: "text",
      text: "before [Image #1] after",
    });
  });
});
