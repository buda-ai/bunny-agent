import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { RunnerChunk } from "@bunny-agent/runner-harness";
import { describe, expect, it } from "vitest";
import { AcpSessionUpdateSerializer } from "../session-update-serializer.js";

async function* chunksOf(chunks: RunnerChunk[]): AsyncIterable<RunnerChunk> {
  for (const chunk of chunks) yield chunk;
}

interface CollectResult {
  updates: SessionUpdate[];
  serializer: AcpSessionUpdateSerializer;
}

async function collect(chunks: RunnerChunk[]): Promise<CollectResult> {
  const serializer = new AcpSessionUpdateSerializer();
  const updates: SessionUpdate[] = [];
  for await (const update of serializer.serialize(chunksOf(chunks))) {
    updates.push(update);
  }
  return { updates, serializer };
}

describe("AcpSessionUpdateSerializer", () => {
  it("maps text deltas to agent_message_chunk keyed by message id", async () => {
    const { updates, serializer } = await collect([
      { type: "text-start", id: "m1" },
      { type: "text-delta", id: "m1", delta: "Hello " },
      { type: "text-delta", id: "m1", delta: "world" },
      { type: "text-end", id: "m1" },
      { type: "finish", finishReason: "stop" },
    ]);

    expect(updates).toEqual([
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "m1",
        content: { type: "text", text: "Hello " },
      },
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "m1",
        content: { type: "text", text: "world" },
      },
    ]);
    expect(serializer.stopReason).toBe("end_turn");
  });

  it("maps reasoning to agent_thought_chunk", async () => {
    const { updates } = await collect([
      { type: "reasoning", text: "thinking about it" },
    ]);

    expect(updates).toEqual([
      {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "thinking about it" },
      },
    ]);
  });

  it("opens a tool call once and completes it on output", async () => {
    const { updates } = await collect([
      { type: "tool-input-start", toolCallId: "t1", toolName: "read_file" },
      {
        type: "tool-input-available",
        toolCallId: "t1",
        toolName: "read_file",
        input: { path: "a.ts" },
      },
      { type: "tool-output-available", toolCallId: "t1", output: "contents" },
    ]);

    expect(updates).toEqual([
      {
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        title: "read_file",
        status: "pending",
      },
      {
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        status: "in_progress",
        rawInput: { path: "a.ts" },
      },
      {
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        status: "completed",
        rawOutput: "contents",
        content: [
          { type: "content", content: { type: "text", text: "contents" } },
        ],
      },
    ]);
  });

  it("opens a tool call implicitly when only output arrives", async () => {
    const { updates } = await collect([
      { type: "tool-output-available", toolCallId: "t9", output: "late" },
    ]);

    expect(updates[0]).toEqual({
      sessionUpdate: "tool_call",
      toolCallId: "t9",
      title: "tool",
      status: "pending",
    });
  });

  it("marks failed tool output", async () => {
    const { updates } = await collect([
      { type: "tool-input-start", toolCallId: "t2", toolName: "bash" },
      {
        type: "tool-output-available",
        toolCallId: "t2",
        output: "boom",
        isError: true,
      },
    ]);

    expect(updates.at(-1)).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "t2",
      status: "failed",
    });
  });

  it("maps tool-output-error to a failed tool_call_update", async () => {
    const { updates } = await collect([
      { type: "tool-input-start", toolCallId: "t3", toolName: "bash" },
      { type: "tool-output-error", toolCallId: "t3", errorText: "exit 1" },
    ]);

    expect(updates.at(-1)).toMatchObject({
      sessionUpdate: "tool_call_update",
      toolCallId: "t3",
      status: "failed",
      rawOutput: "exit 1",
    });
  });

  it("reports runner errors as a refusal stop reason", async () => {
    const { updates, serializer } = await collect([
      { type: "error", errorText: "runner exploded" },
      { type: "finish", finishReason: "error" },
    ]);

    expect(updates).toEqual([]);
    expect(serializer.stopReason).toBe("refusal");
    expect(serializer.errorText).toBe("runner exploded");
  });

  it("maps finish reasons to ACP stop reasons", async () => {
    const cases: Array<[string | undefined, string]> = [
      ["stop", "end_turn"],
      ["length", "max_tokens"],
      ["abort", "cancelled"],
      [undefined, "end_turn"],
    ];

    for (const [finishReason, expected] of cases) {
      const { serializer } = await collect([{ type: "finish", finishReason }]);
      expect(serializer.stopReason).toBe(expected);
    }
  });
});
