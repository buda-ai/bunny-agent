import { describe, expect, it } from "vitest";
import { serializeTranscriptToUserInput } from "../provider/transcript";

describe("serializeTranscriptToUserInput", () => {
  it("keeps text while excluding tool history from a fresh-session transcript", () => {
    expect(
      serializeTranscriptToUserInput([
        { role: "user", content: "inspect" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Checking." },
            { type: "tool-call", text: undefined },
          ],
        },
        { role: "tool", content: [{ type: "tool-result", text: undefined }] },
        { role: "user", content: "continue" },
      ]),
    ).toBe(
      "Previous conversation:\n\nUser: inspect\n\nAssistant: Checking.\n\nCurrent message:\n\ncontinue",
    );
  });

  it("keeps consecutive trailing user messages as the current turn", () => {
    expect(
      serializeTranscriptToUserInput([
        { role: "assistant", content: "Ready." },
        { role: "user", content: "first" },
        { role: "user", content: "second" },
      ]),
    ).toBe(
      "Previous conversation:\n\nAssistant: Ready.\n\nCurrent message:\n\nfirst\n\nsecond",
    );
  });
});
