import { describe, expect, it } from "vitest";

// getLastUserTextFromMessages and serializeMessagesToUserInput are not
// exported from bunny-agent-language-model.ts (module-private helpers). We
// recreate the logic here so the semantics remain locked to test coverage.

type MessageContent =
  | string
  | Array<
      { type: "text"; text: string } | { type: string; [key: string]: unknown }
    >;

interface Message {
  role: "user" | "assistant" | "system";
  content: MessageContent;
}

function extractTextContent(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
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
    .map((msg) => extractTextContent(msg.content))
    .join("\n\n");
}

function serializeMessagesToUserInput(messages: Message[]): string {
  let currentStart = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      currentStart = i;
    } else {
      break;
    }
  }

  const history = messages.slice(0, currentStart);
  const current = messages.slice(currentStart);

  const currentText = current
    .map((msg) => extractTextContent(msg.content))
    .filter((t) => t.length > 0)
    .join("\n\n");

  if (history.length === 0) return currentText;

  const historyLines: string[] = [];
  for (const msg of history) {
    const text = extractTextContent(msg.content);
    if (text.length === 0) continue;
    const label =
      msg.role === "user"
        ? "User"
        : msg.role === "assistant"
          ? "Assistant"
          : "System";
    historyLines.push(`${label}: ${text}`);
  }

  if (historyLines.length === 0) return currentText;

  const historyBlock = `Previous conversation:\n\n${historyLines.join("\n\n")}`;
  if (currentText.length === 0) return historyBlock;
  return `${historyBlock}\n\nCurrent message:\n\n${currentText}`;
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

describe("serializeMessagesToUserInput", () => {
  it("returns empty string for empty messages", () => {
    expect(serializeMessagesToUserInput([])).toBe("");
  });

  it("returns just the current user turn when no history exists", () => {
    const messages: Message[] = [{ role: "user", content: "Hello" }];
    expect(serializeMessagesToUserInput(messages)).toBe("Hello");
  });

  it("joins consecutive trailing user turns as the current message", () => {
    const messages: Message[] = [
      { role: "user", content: "part one" },
      { role: "user", content: "part two" },
    ];
    expect(serializeMessagesToUserInput(messages)).toBe("part one\n\npart two");
  });

  it("prefixes prior turns as history and marks the current message", () => {
    const messages: Message[] = [
      { role: "user", content: "你是 vika" },
      { role: "assistant", content: "好的，我记住了。" },
      { role: "user", content: "你是？" },
    ];
    expect(serializeMessagesToUserInput(messages)).toBe(
      "Previous conversation:\n\n" +
        "User: 你是 vika\n\n" +
        "Assistant: 好的，我记住了。\n\n" +
        "Current message:\n\n" +
        "你是？",
    );
  });

  it("labels system turns and preserves order", () => {
    const messages: Message[] = [
      { role: "system", content: "be terse" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "again" },
    ];
    expect(serializeMessagesToUserInput(messages)).toBe(
      "Previous conversation:\n\n" +
        "System: be terse\n\n" +
        "User: hi\n\n" +
        "Assistant: hi\n\n" +
        "Current message:\n\n" +
        "again",
    );
  });

  it("skips empty text turns in history", () => {
    const messages: Message[] = [
      { role: "user", content: "keep me" },
      { role: "assistant", content: [{ type: "image", url: "..." }] },
      { role: "user", content: "now" },
    ];
    expect(serializeMessagesToUserInput(messages)).toBe(
      "Previous conversation:\n\n" +
        "User: keep me\n\n" +
        "Current message:\n\n" +
        "now",
    );
  });

  it("extracts text parts from array content in history", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "first" },
          { type: "image", url: "..." },
        ],
      },
      { role: "assistant", content: "ack" },
      { role: "user", content: "next" },
    ];
    expect(serializeMessagesToUserInput(messages)).toBe(
      "Previous conversation:\n\n" +
        "User: first\n\n" +
        "Assistant: ack\n\n" +
        "Current message:\n\n" +
        "next",
    );
  });

  it("returns only the history block when there is no trailing user turn", () => {
    const messages: Message[] = [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
    ];
    expect(serializeMessagesToUserInput(messages)).toBe(
      "Previous conversation:\n\n" + "User: one\n\n" + "Assistant: two",
    );
  });
});
