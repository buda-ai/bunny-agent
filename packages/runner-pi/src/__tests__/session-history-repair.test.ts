import { describe, expect, it, vi } from "vitest";
import {
  installPiSessionToolHistoryRepair,
  repairPiSessionToolHistory,
} from "../session-history-repair.js";

function assistant(content: unknown[]): Record<string, unknown> {
  return { role: "assistant", content };
}

function toolResult(
  toolCallId: string,
  toolName: string,
): Record<string, unknown> {
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text: "ok" }],
  };
}

describe("repairPiSessionToolHistory", () => {
  it("preserves a unique complete tool call/result pair", () => {
    const messages = [
      { role: "user", content: "inspect" },
      assistant([
        { type: "text", text: "Checking." },
        { type: "toolCall", id: "call-1", name: "read", arguments: {} },
      ]),
      toolResult("call-1", "read"),
    ];

    const repaired = repairPiSessionToolHistory(messages);

    expect(repaired.messages).toEqual(messages);
    expect(repaired.stats).toEqual({
      removedToolCalls: 0,
      removedToolResults: 0,
      removedEmptyAssistantMessages: 0,
    });
  });

  it("drops blank, duplicate, incomplete, orphaned, and mismatched tool history", () => {
    const messages = [
      { role: "user", content: "inspect" },
      assistant([
        { type: "text", text: "Text survives." },
        { type: "toolCall", id: "", name: "read", arguments: {} },
        { type: "toolCall", id: "duplicate", name: "read", arguments: {} },
        { type: "toolCall", id: "incomplete", name: "read", arguments: {} },
        { type: "toolCall", id: "mismatch", name: "read", arguments: {} },
      ]),
      toolResult("duplicate", "read"),
      assistant([
        { type: "toolCall", id: "duplicate", name: "read", arguments: {} },
      ]),
      toolResult("duplicate", "read"),
      toolResult("orphan", "read"),
      toolResult("mismatch", "bash"),
      toolResult("", "read"),
    ];

    const repaired = repairPiSessionToolHistory(messages);

    expect(repaired.messages).toEqual([
      { role: "user", content: "inspect" },
      assistant([{ type: "text", text: "Text survives." }]),
    ]);
    expect(repaired.stats).toEqual({
      removedToolCalls: 5,
      removedToolResults: 5,
      removedEmptyAssistantMessages: 1,
    });
  });

  it("does not pair a tool result across a conversation boundary", () => {
    const messages = [
      assistant([
        { type: "toolCall", id: "late", name: "read", arguments: {} },
      ]),
      { role: "user", content: "new turn" },
      toolResult("late", "read"),
    ];

    expect(repairPiSessionToolHistory(messages).messages).toEqual([
      { role: "user", content: "new turn" },
    ]);
  });

  it("wraps buildSessionContext without mutating persisted message objects", () => {
    const originalMessages = [
      assistant([
        { type: "text", text: "Keep this." },
        { type: "toolCall", id: "unfinished", name: "read", arguments: {} },
      ]),
    ];
    const manager = {
      buildSessionContext: () => ({
        messages: originalMessages,
        thinkingLevel: "off",
      }),
    };
    const onRepair = vi.fn();

    installPiSessionToolHistoryRepair(manager, onRepair);
    const context = manager.buildSessionContext();

    expect(context.messages).toEqual([
      assistant([{ type: "text", text: "Keep this." }]),
    ]);
    expect(originalMessages[0]).toEqual(
      assistant([
        { type: "text", text: "Keep this." },
        { type: "toolCall", id: "unfinished", name: "read", arguments: {} },
      ]),
    );
    expect(onRepair).toHaveBeenCalledWith({
      removedToolCalls: 1,
      removedToolResults: 0,
      removedEmptyAssistantMessages: 0,
    });
  });
});
