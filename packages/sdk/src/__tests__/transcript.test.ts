import { describe, expect, it } from "vitest";
import {
  sanitizeTranscriptToolHistory,
  serializeTranscriptToUserInput,
} from "../provider/transcript";

describe("sanitizeTranscriptToolHistory", () => {
  it("migrates Buda tool-history cleanup to the Bunny SDK boundary", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Keep this text." },
          {
            type: "tool-read",
            toolCallId: "",
            state: "output-available",
          },
          {
            type: "dynamic-tool",
            toolName: "",
            toolCallId: "blank-name",
            state: "output-available",
          },
          {
            type: "tool-read",
            toolCallId: "duplicate",
            state: "output-available",
          },
          {
            type: "tool-read",
            toolCallId: "duplicate",
            state: "output-available",
          },
          {
            type: "tool-read",
            toolCallId: "incomplete",
            state: "input-available",
          },
          {
            type: "tool-read",
            toolCallId: "complete",
            state: "output-available",
          },
        ],
      },
    ];

    expect(sanitizeTranscriptToolHistory(messages)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "Keep this text." },
          {
            type: "tool-read",
            toolCallId: "complete",
            state: "output-available",
          },
        ],
      },
    ]);
    expect(messages[0]?.content).toHaveLength(7);
  });
});

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
