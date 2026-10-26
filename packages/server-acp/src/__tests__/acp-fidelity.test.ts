import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { RunnerChunk } from "@bunny-agent/runner-harness";
import { describe, expect, it } from "vitest";
import {
  AcpSessionUpdateSerializer,
  type SerializedAcpEvent,
} from "../session-update-serializer.js";

async function collect(chunks: RunnerChunk[]) {
  const serializer = new AcpSessionUpdateSerializer({
    turnId: "turn-1",
    cwd: "/workspace",
    now: () => "2026-10-26T00:00:00Z",
  });
  const events: SerializedAcpEvent[] = [];
  for await (const event of serializer.serializeEvents(
    (async function* () {
      yield* chunks;
    })(),
  ))
    events.push(event);
  return {
    serializer,
    events,
    updates: events.flatMap((event) =>
      event.type === "update" ? [event.update] : [],
    ),
    lifecycle: events.flatMap((event) =>
      event.type === "lifecycle" ? [event.event] : [],
    ),
  };
}

describe("ACP display fidelity", () => {
  it("preserves native ACP plans, structured diffs and metadata without duplicate compatibility output", async () => {
    const original: SessionUpdate[] = [
      {
        sessionUpdate: "plan",
        entries: [
          { content: "Edit file", status: "in_progress", priority: "high" },
        ],
      },
      {
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        title: "Edit a.ts",
        kind: "edit",
        status: "completed",
        locations: [{ path: "/workspace/a.ts", line: 3 }],
        content: [
          {
            type: "diff",
            path: "/workspace/a.ts",
            oldText: "old",
            newText: "new",
          },
        ],
        _meta: { provider: { nested: { value: 1 } } },
      },
    ];
    const { updates, serializer } = await collect([
      { type: "data-acp-session-update", data: original[0] },
      { type: "data-acp-session-update", data: original[1] },
      { type: "tool-input-start", toolCallId: "t1", toolName: "Edit a.ts" },
      {
        type: "tool-output-available",
        toolCallId: "t1",
        output: "would duplicate",
      },
      {
        type: "finish",
        finishReason: "error",
        messageMetadata: { acpStopReason: "cancelled" },
      },
    ]);
    expect(updates).toEqual(original);
    expect(serializer.stopReason).toBe("cancelled");
  });

  it("reports plans and actionable edit details while retaining original tool parameters", async () => {
    const input = { file_path: "a.ts", old_string: "old", new_string: "new" };
    const { updates } = await collect([
      {
        type: "tool-input-available",
        toolCallId: "p1",
        toolName: "TodoWrite",
        input: {
          todos: [
            {
              content: "Edit file",
              activeForm: "Editing file",
              status: "in_progress",
            },
          ],
        },
      },
      {
        type: "tool-output-available",
        toolCallId: "p1",
        output: "Plan updated",
      },
      {
        type: "tool-input-available",
        toolCallId: "t1",
        toolName: "Edit",
        input,
        parentToolCallId: "task-1",
      },
      {
        type: "tool-output-available",
        toolCallId: "t1",
        output: [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }],
      },
    ]);
    expect(updates).toContainEqual({
      sessionUpdate: "plan",
      entries: [
        { content: "Editing file", status: "in_progress", priority: "medium" },
      ],
    });
    expect(
      updates.find(
        (update) =>
          update.sessionUpdate === "tool_call_update" &&
          update.toolCallId === "t1",
      ),
    ).toMatchObject({
      kind: "edit",
      title: "Edit: a.ts",
      rawInput: input,
      locations: [{ path: "/workspace/a.ts" }],
      content: [
        {
          type: "diff",
          path: "/workspace/a.ts",
          oldText: "old",
          newText: "new",
        },
      ],
      _meta: { "bunny-agent/parentToolCallId": "task-1" },
    });
    expect(updates.at(-1)).toMatchObject({
      content: [
        {
          type: "content",
          content: {
            type: "image",
            data: "aW1hZ2U=",
            mimeType: "image/png",
          },
        },
      ],
    });
  });

  it("keeps ordered text, sources and late citation metadata on the original answer", async () => {
    const providerMetadata = {
      "bunny-agent": {
        citation_contract: {
          schema_version: 1,
          offset_unit: "unicode-code-points",
          annotations: [
            {
              type: "url_citation",
              start_index: 0,
              end_index: 2,
              url: "https://example.org",
              title: "Source",
            },
          ],
          bindings: [
            {
              annotation_index: 0,
              source_id: "src1",
              origin: "provider",
              tool_call_ids: [],
            },
          ],
          processing: "complete",
        },
      },
    };
    const { updates } = await collect([
      { type: "text-start", id: "answer-1" },
      { type: "text-delta", id: "answer-1", delta: "A😀 cited answer" },
      {
        type: "source-url",
        sourceId: "src1",
        url: "https://example.org",
        title: "Source",
      },
      { type: "text-end", id: "answer-1", providerMetadata },
    ]);
    expect(
      updates.map((update) =>
        "messageId" in update ? update.messageId : null,
      ),
    ).toEqual(["answer-1", "answer-1", "answer-1"]);
    expect(updates[1]).toMatchObject({
      content: {
        type: "resource_link",
        uri: "https://example.org",
        name: "Source",
      },
      _meta: { "bunny-agent/sourceId": "src1" },
    });
    expect(updates[2]).toMatchObject({
      content: { type: "text", text: "" },
      _meta: { "bunny-agent/providerMetadata": providerMetadata },
    });
  });

  it("maintains modern Claude task plans from creation and status updates", async () => {
    const { updates } = await collect([
      {
        type: "tool-input-available",
        toolCallId: "create",
        toolName: "TaskCreate",
        input: { subject: "Review changes" },
      },
      {
        type: "tool-output-available",
        toolCallId: "create",
        output: { task: { id: "task-1", subject: "Review changes" } },
      },
      {
        type: "tool-input-available",
        toolCallId: "update",
        toolName: "TaskUpdate",
        input: { taskId: "task-1", status: "completed" },
      },
      {
        type: "tool-output-available",
        toolCallId: "update",
        output: { success: true },
      },
    ]);
    expect(updates.filter((update) => update.sessionUpdate === "plan")).toEqual(
      [
        {
          sessionUpdate: "plan",
          entries: [
            {
              content: "Review changes",
              status: "pending",
              priority: "medium",
            },
          ],
        },
        {
          sessionUpdate: "plan",
          entries: [
            {
              content: "Review changes",
              status: "completed",
              priority: "medium",
            },
          ],
        },
      ],
    );
  });

  it("emits real step boundaries and distinguishes cancellation without inventing a plan or step", async () => {
    const plain = await collect([
      { type: "text-delta", id: "m", delta: "hello" },
      { type: "finish", finishReason: "stop" },
    ]);
    expect(plain.lifecycle.map((event) => event.type)).toEqual([
      "turn_started",
      "turn_finished",
    ]);
    const stepped = await collect([
      { type: "start-step", id: "s1" },
      { type: "finish-step" },
      { type: "start-step", id: "s2" },
      { type: "finish", finishReason: "abort" },
    ]);
    expect(
      stepped.lifecycle.map((event) => [
        event.type,
        event.stepId,
        event.stopReason,
      ]),
    ).toEqual([
      ["turn_started", undefined, undefined],
      ["step_started", "s1", undefined],
      ["step_finished", "s1", undefined],
      ["step_started", "s2", undefined],
      ["step_finished", "s2", undefined],
      ["turn_finished", undefined, "cancelled"],
    ]);
  });

  it("keeps partial input as partial metadata and closes all terminal tool outcomes", async () => {
    const { updates } = await collect([
      {
        type: "tool-input-delta",
        toolCallId: "t1",
        inputTextDelta: '{"path":',
      },
      { type: "tool-input-delta", toolCallId: "t1", inputTextDelta: '"a"}' },
      { type: "tool-output-denied", toolCallId: "t1" },
    ]);
    expect(updates[1]).not.toHaveProperty("rawInput");
    expect(updates[2]).toMatchObject({
      _meta: { "bunny-agent/inputText": '{"path":"a"}' },
    });
    expect(updates.at(-1)).toMatchObject({
      toolCallId: "t1",
      status: "failed",
    });
  });

  it("closes unfinished tools and reports cancellation even if the runner emits a generic error", async () => {
    const controller = new AbortController();
    const serializer = new AcpSessionUpdateSerializer({
      turnId: "turn1",
      signal: controller.signal,
    });
    const events: SerializedAcpEvent[] = [];
    const chunks = (async function* (): AsyncIterable<RunnerChunk> {
      yield {
        type: "tool-input-start",
        toolCallId: "pending-tool",
        toolName: "bash",
      };
      controller.abort();
      yield { type: "error", errorText: "AbortError" };
      yield { type: "finish", finishReason: "error" };
    })();
    for await (const event of serializer.serializeEvents(chunks))
      events.push(event);
    expect(events).toContainEqual({
      type: "update",
      update: expect.objectContaining({
        toolCallId: "pending-tool",
        status: "failed",
        _meta: { "bunny-agent/interrupted": true },
      }),
    });
    expect(events.at(-1)).toMatchObject({
      type: "lifecycle",
      event: { type: "turn_finished", stopReason: "cancelled" },
    });
    expect(serializer.stopReason).toBe("cancelled");
  });

  it("keeps document and audio resources, unknown data and reported zero usage", async () => {
    const { updates, serializer } = await collect([
      {
        type: "file",
        url: "data:audio/wav;base64,YXVkaW8=",
        filename: "voice.wav",
        mediaType: "audio/wav",
      },
      {
        type: "file",
        url: "https://example.org/report.pdf",
        filename: "report.pdf",
        mediaType: "application/pdf",
      },
      { type: "data-future", data: { preserved: true } },
      {
        type: "finish",
        messageMetadata: {
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      },
    ]);
    expect(updates[0]).toMatchObject({
      content: { type: "audio", mimeType: "audio/wav", data: "YXVkaW8=" },
    });
    expect(updates[1]).toMatchObject({
      content: { type: "resource_link", name: "report.pdf" },
    });
    expect(updates[2]).toMatchObject({
      _meta: {
        "bunny-agent/runnerData": {
          type: "data-future",
          data: { preserved: true },
        },
      },
    });
    expect(serializer.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedReadTokens: 0,
    });
  });
});
