import type {
  AssistantMessage,
  Message,
  Model,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import { transformMessages } from "@earendil-works/pi-ai/api/transform-messages";
import { describe, expect, it } from "vitest";

const SIGNATURE = "A".repeat(128);
const SIGNED_TOOL_CALL_ID = `call_abc__thought__${SIGNATURE}`;

function createModel(id: string): Model<"openai-completions"> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: "openai",
    baseUrl: "https://example.com/v1",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 65_536,
  };
}

function createHistory({
  toolCallId = SIGNED_TOOL_CALL_ID,
  thoughtSignature = SIGNATURE,
  model = "gemini-3.1-pro",
}: {
  toolCallId?: string;
  thoughtSignature?: string;
  model?: string;
} = {}): Message[] {
  const assistant: AssistantMessage = {
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: toolCallId,
        name: "bash",
        arguments: { command: "pwd" },
        thoughtSignature,
      },
    ],
    api: "openai-completions",
    provider: "openai",
    model,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: 1,
  };
  const toolResult: ToolResultMessage = {
    role: "toolResult",
    toolCallId,
    toolName: "bash",
    content: [{ type: "text", text: "/tmp" }],
    isError: false,
    timestamp: 2,
  };
  return [assistant, toolResult];
}

describe("pi-ai embedded thought-signature patch", () => {
  it("removes embedded signatures before cross-model ID normalization", () => {
    const history = createHistory();
    const originalHistory = structuredClone(history);
    const messages = transformMessages(
      history,
      createModel("gemini-3.7-flash"),
      (id) => id.slice(0, 40),
    );
    const assistant = messages[0] as AssistantMessage;
    const toolResult = messages[1] as ToolResultMessage;
    const toolCall = assistant.content[0];

    expect(toolCall).toMatchObject({ type: "toolCall", id: "call_abc" });
    expect(toolCall).not.toHaveProperty("thoughtSignature");
    expect(toolResult.toolCallId).toBe("call_abc");
    expect(history).toEqual(originalHistory);
  });

  it("preserves embedded signatures for same-model replay", () => {
    const history = createHistory();
    const originalHistory = structuredClone(history);
    const messages = transformMessages(
      history,
      createModel("gemini-3.1-pro"),
      (id) => id.slice(0, 40),
    );
    const assistant = messages[0] as AssistantMessage;
    const toolResult = messages[1] as ToolResultMessage;

    expect(assistant.content[0]).toMatchObject({
      type: "toolCall",
      id: SIGNED_TOOL_CALL_ID,
      thoughtSignature: SIGNATURE,
    });
    expect(toolResult.toolCallId).toBe(SIGNED_TOOL_CALL_ID);
    expect(history).toEqual(originalHistory);
  });

  it("repairs a truncated signature in the request without mutating history", () => {
    const truncatedId = "call_2021541__thought__AY89a1/Y1ykE5wo1C";
    expect(truncatedId).toHaveLength(40);
    const history = createHistory({
      toolCallId: truncatedId,
      thoughtSignature: "AY89a1/Y1ykE5wo1C",
      model: "gemini-3.7-flash",
    });
    const originalHistory = structuredClone(history);

    const messages = transformMessages(
      history,
      createModel("gemini-3.7-flash"),
      (id) => id.slice(0, 40),
    );
    const assistant = messages[0] as AssistantMessage;
    const toolResult = messages[1] as ToolResultMessage;

    expect(assistant.content[0]).toMatchObject({
      type: "toolCall",
      id: "call_2021541",
    });
    expect(assistant.content[0]).not.toHaveProperty("thoughtSignature");
    expect(toolResult.toolCallId).toBe("call_2021541");
    expect(history).toEqual(originalHistory);
  });
});
