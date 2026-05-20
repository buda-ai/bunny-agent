import { describe, expect, it } from "vitest";

// Extract the function for testing by importing the module internals
// Since getLastUserTextFromMessages is not exported, we test it indirectly
// by recreating the logic here for unit testing.

type MessageContent =
  | string
  | Array<
      { type: "text"; text: string } | { type: string; [key: string]: unknown }
    >;

interface Message {
  role: "user" | "assistant" | "system";
  content: MessageContent;
}

function getLastUserTextFromMessages(messages: Message[]): string {
  const trailingUserMessages: Message[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      trailingUserMessages.unshift(messages[i]);
    } else {
      break;
    }
  }
  if (trailingUserMessages.length === 0) return "";
  return trailingUserMessages
    .map((msg) => {
      const c = msg.content;
      if (typeof c === "string") return c;
      return c
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
    })
    .join("\n\n");
}

describe("getLastUserTextFromMessages", () => {
  it("returns empty string for empty messages", () => {
    expect(getLastUserTextFromMessages([])).toBe("");
  });

  it("returns empty string when no user messages", () => {
    const messages: Message[] = [{ role: "assistant", content: "Hello" }];
    expect(getLastUserTextFromMessages(messages)).toBe("");
  });

  it("returns single trailing user message text", () => {
    const messages: Message[] = [
      { role: "assistant", content: "Hi" },
      { role: "user", content: "What is 1+1?" },
    ];
    expect(getLastUserTextFromMessages(messages)).toBe("What is 1+1?");
  });

  it("returns all consecutive trailing user messages joined", () => {
    const messages: Message[] = [
      { role: "assistant", content: "Hi" },
      { role: "user", content: "1+1=?" },
      { role: "user", content: "1+2=?" },
      { role: "user", content: "1+3=?" },
    ];
    expect(getLastUserTextFromMessages(messages)).toBe(
      "1+1=?\n\n1+2=?\n\n1+3=?",
    );
  });

  it("only includes trailing user messages, not earlier ones", () => {
    const messages: Message[] = [
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "1+1=?" },
      { role: "user", content: "1+2=?" },
    ];
    expect(getLastUserTextFromMessages(messages)).toBe("1+1=?\n\n1+2=?");
  });

  it("handles content as array of parts", () => {
    const messages: Message[] = [
      { role: "assistant", content: "Hi" },
      {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "World" }],
      },
    ];
    expect(getLastUserTextFromMessages(messages)).toBe("Hello\n\nWorld");
  });

  it("filters non-text parts", () => {
    const messages: Message[] = [
      { role: "assistant", content: "Hi" },
      {
        role: "user",
        content: [
          { type: "text", text: "Check this" },
          { type: "image", url: "http://example.com/img.png" },
        ],
      },
    ];
    expect(getLastUserTextFromMessages(messages)).toBe("Check this");
  });

  it("handles mixed string and array content in consecutive messages", () => {
    const messages: Message[] = [
      { role: "assistant", content: "Hi" },
      { role: "user", content: "plain text" },
      {
        role: "user",
        content: [{ type: "text", text: "array text" }],
      },
    ];
    expect(getLastUserTextFromMessages(messages)).toBe(
      "plain text\n\narray text",
    );
  });
});
