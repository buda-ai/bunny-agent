/**
 * Tests for Answer Extractor
 */

import { describe, expect, it } from "vitest";
import {
  extractAnswerFromMessage,
  extractAnswerFromSSE,
  parseSSEToMessage,
} from "../answer-extractor.js";

describe("parseSSEToMessage", () => {
  it("should parse text deltas from SSE stream", () => {
    const sseOutput = `data: {"type":"start","messageId":"msg-123"}

data: {"type":"text-delta","delta":"Hello "}

data: {"type":"text-delta","delta":"World"}

data: {"type":"finish"}`;

    const message = parseSSEToMessage(sseOutput);

    expect(message.id).toBe("msg-123");
    expect(message.textContent).toBe("Hello World");
    expect(message.parts).toHaveLength(1);
    expect(message.parts[0]).toEqual({ type: "text", text: "Hello World" });
  });

  it("should parse tool outputs from SSE stream", () => {
    const sseOutput = `data: {"type":"tool-output-available","toolCallId":"call-1","toolName":"Bash","output":{"stdout":"42","stderr":""}}`;

    const message = parseSSEToMessage(sseOutput);

    expect(message.toolOutputs).toHaveLength(1);
    expect(message.toolOutputs[0].toolName).toBe("Bash");
    expect(message.toolOutputs[0].output).toEqual({ stdout: "42", stderr: "" });
  });
});

describe("extractAnswerFromMessage", () => {
  it("should extract from TaskOutput tool", () => {
    const message = {
      parts: [],
      textContent: "",
      toolOutputs: [
        {
          toolName: "TaskOutput",
          toolCallId: "call-1",
          output: { content: "Paris" },
        },
      ],
      reasoningText: "",
    };

    expect(extractAnswerFromMessage(message)).toBe("Paris");
  });

  it("should extract from stdout with ANSWER pattern", () => {
    const message = {
      parts: [],
      textContent: "",
      toolOutputs: [
        {
          toolName: "Bash",
          toolCallId: "call-1",
          output: { stdout: "FINAL ANSWER: 42" },
        },
      ],
      reasoningText: "",
    };

    expect(extractAnswerFromMessage(message)).toBe("42");
  });

  it("should extract from text content with FINAL ANSWER marker", () => {
    const message = {
      parts: [],
      textContent: "After analyzing the data, FINAL ANSWER: 100",
      toolOutputs: [],
      reasoningText: "",
    };

    expect(extractAnswerFromMessage(message)).toBe("100");
  });
});

describe("extractAnswerFromSSE", () => {
  it("should extract simple numeric answer", () => {
    const sseOutput = `data: {"type":"tool-output-available","toolCallId":"test","toolName":"Bash","output":{"stdout":"ANSWER: 42","stderr":""}}`;
    expect(extractAnswerFromSSE(sseOutput)).toBe("42");
  });

  it("should extract Ball number from probability task", () => {
    const sseOutput = `data: {"type":"tool-output-available","toolCallId":"test","toolName":"Bash","output":{"stdout":"Ball with HIGHEST ejection probability: Ball #3\\nEjection probability: 0.630990\\n\\nANSWER: Ball #3 has the highest!","stderr":""}}`;
    expect(extractAnswerFromSSE(sseOutput)).toBe("3");
  });

  it("should extract from TaskOutput tool", () => {
    const sseOutput = `data: {"type":"tool-output-available","toolCallId":"test","toolName":"TaskOutput","output":{"content":"Braintree, Honolulu"}}`;
    expect(extractAnswerFromSSE(sseOutput)).toBe("Braintree, Honolulu");
  });

  it("should extract from text delta with FINAL ANSWER", () => {
    const sseOutput = `data: {"type":"text-delta","delta":"After calculation, FINAL ANSWER: 256"}`;
    expect(extractAnswerFromSSE(sseOutput)).toBe("256");
  });

  it("should extract comma-separated list", () => {
    const sseOutput = `data: {"type":"text-delta","delta":"The comma-separated list in alphabetical order: apple, banana, cherry"}`;
    expect(extractAnswerFromSSE(sseOutput)).toBe("apple, banana, cherry");
  });
});
