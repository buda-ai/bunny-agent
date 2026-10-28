import type {
  ContentBlock,
  PlanEntry,
  SessionUpdate,
  StopReason,
  Usage,
} from "@agentclientprotocol/sdk";
import type { RunnerChunk } from "@bunny-agent/runner-harness";
import type { BunnyAcpLifecycleEvent } from "./lifecycle.js";
import {
  contentBlock,
  planEntries,
  recordOf,
  toolContents,
  toolDisplay,
  toolKind,
} from "./tool-display.js";

export type SerializedAcpEvent =
  | { type: "update"; update: SessionUpdate }
  | { type: "lifecycle"; event: BunnyAcpLifecycleEvent };

export interface AcpSerializerOptions {
  turnId?: string;
  cwd?: string;
  now?: () => string;
  signal?: AbortSignal;
}

/** Converts the runner stream once; protocol-native events retain their payload. */
export class AcpSessionUpdateSerializer {
  private readonly startedTools = new Set<string>();
  private readonly terminalTools = new Set<string>();
  private readonly toolTitles = new Map<string, string>();
  private readonly toolInputs = new Map<string, string>();
  private readonly completeToolInputs = new Map<string, unknown>();
  private readonly taskPlan = new Map<string, PlanEntry>();
  private stopReasonValue: StopReason = "end_turn";
  private errorTextValue: string | undefined;
  private sessionIdValue: string | undefined;
  private inputTokensValue = 0;
  private outputTokensValue = 0;
  private usageReported = false;
  private readonly extraUsage: Partial<Usage> = {};
  private nativePassthrough = false;
  private stepNumber = 0;
  private activeStepId: string | undefined;
  private messageId: string | undefined;
  private readonly turnId: string;
  private readonly now: () => string;

  constructor(private readonly options: AcpSerializerOptions = {}) {
    this.turnId = options.turnId ?? "turn";
    this.now = options.now ?? (() => new Date().toISOString());
  }

  get stopReason(): StopReason {
    return this.options.signal?.aborted ? "cancelled" : this.stopReasonValue;
  }
  get errorText(): string | undefined {
    return this.errorTextValue;
  }
  get sessionId(): string | undefined {
    return this.sessionIdValue;
  }
  get usage(): Usage | undefined {
    if (!this.usageReported) return undefined;
    return {
      ...this.extraUsage,
      inputTokens: this.inputTokensValue,
      outputTokens: this.outputTokensValue,
      totalTokens:
        this.extraUsage.totalTokens ??
        this.inputTokensValue + this.outputTokensValue,
    };
  }

  /** Compatibility API for consumers interested only in standard ACP updates. */
  async *serialize(
    chunks: AsyncIterable<RunnerChunk>,
  ): AsyncIterable<SessionUpdate> {
    for await (const event of this.serializeEvents(chunks)) {
      if (event.type === "update") yield event.update;
    }
  }

  async *serializeEvents(
    chunks: AsyncIterable<RunnerChunk>,
  ): AsyncIterable<SerializedAcpEvent> {
    yield this.lifecycle("turn_started");
    try {
      for await (const chunk of chunks) yield* this.convert(chunk);
    } catch (error) {
      this.errorTextValue =
        error instanceof Error ? error.message : String(error);
      this.stopReasonValue = "refusal";
      throw error;
    } finally {
      for (const id of this.startedTools) {
        if (this.terminalTools.has(id)) continue;
        this.terminalTools.add(id);
        const message =
          this.stopReason === "cancelled"
            ? "The tool was interrupted when the turn was cancelled."
            : "The turn ended before this tool returned.";
        yield this.update({
          sessionUpdate: "tool_call_update",
          toolCallId: id,
          status: "failed",
          rawOutput: message,
          content: [
            { type: "content", content: { type: "text", text: message } },
          ],
          _meta: { "bunny-agent/interrupted": true },
        });
      }
      if (this.activeStepId) {
        yield this.lifecycle("step_finished", { stepId: this.activeStepId });
        this.activeStepId = undefined;
      }
      yield this.lifecycle("turn_finished", {
        stopReason: this.stopReason,
        ...(this.usage
          ? {
              usage: Object.fromEntries(
                Object.entries(this.usage).filter(
                  ([, value]) => typeof value === "number",
                ),
              ),
            }
          : {}),
      });
    }
  }

  private lifecycle(
    type: BunnyAcpLifecycleEvent["type"],
    fields: Partial<BunnyAcpLifecycleEvent> = {},
  ): SerializedAcpEvent {
    return {
      type: "lifecycle",
      event: {
        version: 1,
        type,
        turnId: this.turnId,
        at: this.now(),
        ...fields,
      },
    };
  }

  private update(update: SessionUpdate): SerializedAcpEvent {
    return { type: "update", update };
  }

  private metadata(chunk: RunnerChunk): Record<string, unknown> | undefined {
    const value = chunk as Record<string, unknown>;
    const original = recordOf(value._meta);
    const providerMetadata = recordOf(value.providerMetadata);
    const parentToolCallId = value.parentToolCallId ?? value.parent_tool_use_id;
    if (!original && !providerMetadata && typeof parentToolCallId !== "string")
      return undefined;
    return {
      ...original,
      ...(providerMetadata
        ? { "bunny-agent/providerMetadata": providerMetadata }
        : {}),
      ...(typeof parentToolCallId === "string"
        ? { "bunny-agent/parentToolCallId": parentToolCallId }
        : {}),
    };
  }

  private *convert(chunk: RunnerChunk): Iterable<SerializedAcpEvent> {
    const value = chunk as Record<string, unknown>;
    const meta = this.metadata(chunk);
    if (chunk.type === "data-acp-session-update") {
      const original = recordOf(value.data);
      if (typeof original?.sessionUpdate === "string") {
        this.nativePassthrough = true;
        if (
          (original.sessionUpdate === "tool_call" ||
            original.sessionUpdate === "tool_call_update") &&
          typeof original.toolCallId === "string"
        ) {
          this.startedTools.add(original.toolCallId);
          if (original.status === "completed" || original.status === "failed")
            this.terminalTools.add(original.toolCallId);
        }
        yield this.update(original as SessionUpdate);
      }
      return;
    }
    if (
      this.nativePassthrough &&
      ![
        "finish",
        "message-metadata",
        "error",
        "step-finish",
        "finish-step",
      ].includes(chunk.type)
    )
      return;

    switch (chunk.type) {
      case "text-start":
        if (typeof value.id === "string") this.messageId = value.id;
        return;
      case "text-delta":
      case "reasoning":
      case "reasoning-delta": {
        const text = chunk.type === "reasoning" ? value.text : value.delta;
        if (typeof text !== "string") return;
        if (chunk.type === "text-delta" && typeof value.id === "string")
          this.messageId = value.id;
        yield this.update({
          sessionUpdate:
            chunk.type === "text-delta"
              ? "agent_message_chunk"
              : "agent_thought_chunk",
          ...(typeof value.id === "string" ? { messageId: value.id } : {}),
          content: { type: "text", text },
          ...(meta ? { _meta: meta } : {}),
        });
        return;
      }
      case "text-end": {
        if (!meta) return;
        // Citation bindings often arrive only after the last text delta.
        yield this.update({
          sessionUpdate: "agent_message_chunk",
          messageId: value.id as string,
          content: { type: "text", text: "" },
          _meta: meta,
        });
        return;
      }
      case "tool-input-start": {
        if (typeof value.toolCallId !== "string") return;
        yield* this.openToolCall(
          value.toolCallId,
          typeof value.toolName === "string" ? value.toolName : undefined,
          meta,
        );
        return;
      }
      case "tool-input-delta": {
        if (
          typeof value.toolCallId !== "string" ||
          typeof value.inputTextDelta !== "string"
        )
          return;
        const inputText =
          (this.toolInputs.get(value.toolCallId) ?? "") + value.inputTextDelta;
        this.toolInputs.set(value.toolCallId, inputText);
        yield* this.openToolCall(
          value.toolCallId,
          this.toolTitles.get(value.toolCallId),
        );
        yield this.update({
          sessionUpdate: "tool_call_update",
          toolCallId: value.toolCallId,
          _meta: { ...meta, "bunny-agent/inputText": inputText },
        });
        return;
      }
      case "tool-input-available": {
        if (typeof value.toolCallId !== "string") return;
        const name =
          typeof value.toolName === "string"
            ? value.toolName
            : (this.toolTitles.get(value.toolCallId) ?? "tool");
        this.completeToolInputs.set(value.toolCallId, value.input);
        yield* this.openToolCall(value.toolCallId, name, meta);
        yield this.update({
          sessionUpdate: "tool_call_update",
          toolCallId: value.toolCallId,
          ...toolDisplay(name, value.input, this.options.cwd),
          status: "in_progress",
          rawInput: value.input,
          ...(meta ? { _meta: meta } : {}),
        });
        const entries = planEntries(value.input);
        if (entries && /todo|plan/i.test(name))
          yield this.update({ sessionUpdate: "plan", entries });
        return;
      }
      case "tool-output-available":
      case "tool-output-error":
      case "tool-input-error":
      case "tool-output-denied": {
        if (typeof value.toolCallId !== "string") return;
        yield* this.openToolCall(
          value.toolCallId,
          this.toolTitles.get(value.toolCallId),
        );
        const failed =
          chunk.type !== "tool-output-available" || value.isError === true;
        const output =
          chunk.type === "tool-output-denied"
            ? "Tool execution was denied."
            : chunk.type === "tool-output-available"
              ? value.output
              : value.errorText;
        this.terminalTools.add(value.toolCallId);
        yield this.update({
          sessionUpdate: "tool_call_update",
          toolCallId: value.toolCallId,
          status: failed ? "failed" : "completed",
          rawOutput: output,
          content: toolContents(output),
          ...(meta ? { _meta: meta } : {}),
        });
        if (!failed) {
          const entries = this.updateTaskPlan(value.toolCallId, output);
          if (entries) yield this.update({ sessionUpdate: "plan", entries });
        }
        return;
      }
      case "file":
      case "source-url":
      case "source-document": {
        const uri = value.url ?? value.uri;
        const name =
          value.filename ?? value.title ?? value.sourceId ?? "Resource";
        const mimeType = value.mediaType ?? value.mimeType;
        let content: ContentBlock | undefined;
        if (typeof uri === "string") {
          const inline = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
          content = inline
            ? inline[1]?.startsWith("image/")
              ? { type: "image", mimeType: inline[1], data: inline[2] ?? "" }
              : inline[1]?.startsWith("audio/")
                ? { type: "audio", mimeType: inline[1], data: inline[2] ?? "" }
                : {
                    type: "resource",
                    resource: {
                      uri: String(name),
                      mimeType: inline[1],
                      blob: inline[2] ?? "",
                    },
                  }
            : {
                type: "resource_link",
                uri,
                name: String(name),
                ...(typeof mimeType === "string" ? { mimeType } : {}),
              };
        } else if (chunk.type === "source-document") {
          content = {
            type: "resource_link",
            uri: `bunny-source:${encodeURIComponent(String(value.sourceId ?? name))}`,
            name: String(name),
            ...(typeof mimeType === "string" ? { mimeType } : {}),
          };
        }
        if (content)
          yield this.update({
            sessionUpdate: "agent_message_chunk",
            content,
            ...(typeof value.id === "string"
              ? { messageId: value.id }
              : this.messageId
                ? { messageId: this.messageId }
                : {}),
            _meta: {
              ...meta,
              ...(value.sourceId
                ? { "bunny-agent/sourceId": value.sourceId }
                : {}),
            },
          });
        if (
          chunk.type === "file" &&
          typeof uri === "string" &&
          !uri.startsWith("data:")
        ) {
          yield this.lifecycle("resource_update", {
            resource: {
              id: String(value.id ?? uri),
              uri,
              name: String(name),
              ...(typeof mimeType === "string" ? { mimeType } : {}),
            },
          });
        }
        return;
      }
      case "start-step":
      case "step-start": {
        if (this.activeStepId)
          yield this.lifecycle("step_finished", { stepId: this.activeStepId });
        this.activeStepId =
          typeof value.stepId === "string"
            ? value.stepId
            : typeof value.id === "string"
              ? value.id
              : `${this.turnId}:step:${++this.stepNumber}`;
        yield this.lifecycle("step_started", { stepId: this.activeStepId });
        return;
      }
      case "finish-step":
      case "step-finish": {
        const usage = recordOf(value.usage);
        if (usage) {
          this.usageReported = true;
          this.inputTokensValue +=
            typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
          this.outputTokensValue +=
            typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
        }
        if (this.activeStepId)
          yield this.lifecycle("step_finished", { stepId: this.activeStepId });
        this.activeStepId = undefined;
        return;
      }
      case "error":
        this.errorTextValue =
          typeof value.errorText === "string"
            ? value.errorText
            : "Runner failed.";
        this.stopReasonValue = "refusal";
        return;
      case "finish": {
        this.captureMetadata(value.messageMetadata);
        if (this.errorTextValue === undefined) {
          const metadata = recordOf(value.messageMetadata);
          this.stopReasonValue = isStopReason(metadata?.acpStopReason)
            ? metadata.acpStopReason
            : mapFinishReason(value.finishReason);
        }
        return;
      }
      case "message-metadata":
        this.captureMetadata(value.messageMetadata);
        // Keep display metadata (including citation/runtime facts) in history.
        yield this.update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "" },
          _meta: { "bunny-agent/messageMetadata": value.messageMetadata },
        });
        return;
      default: {
        const data = recordOf(value.data);
        if (chunk.type === "data-artifact" && data) {
          const uri = data.uri ?? data.url ?? data.path;
          if (typeof uri === "string") {
            yield this.lifecycle("resource_update", {
              resource: {
                id: String(data.id ?? data.artifactId ?? uri),
                uri,
                name: String(
                  data.name ?? data.title ?? data.artifactId ?? "Artifact",
                ),
                ...(typeof data.mimeType === "string"
                  ? { mimeType: data.mimeType }
                  : {}),
                _meta: data,
              },
            });
          }
        } else if (
          (chunk.type === "data-job" || chunk.type === "data-agent-job") &&
          data &&
          typeof data.id === "string" &&
          typeof data.status === "string"
        ) {
          yield this.lifecycle("job_update", {
            job: {
              id: data.id,
              title:
                typeof data.title === "string" ? data.title : "Background task",
              status: data.status,
              ...(typeof data.message === "string"
                ? { message: data.message }
                : {}),
            },
          });
        }
        const block = contentBlock(value.content);
        if (block)
          yield this.update({
            sessionUpdate: "agent_message_chunk",
            content: block,
            ...(meta ? { _meta: meta } : {}),
          });
        else if (
          chunk.type.startsWith("data-") ||
          chunk.type === "compaction"
        ) {
          yield this.update({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "" },
            _meta: { "bunny-agent/runnerData": value },
          });
        }
      }
    }
  }

  private captureMetadata(metadata: unknown): void {
    const value = recordOf(metadata);
    if (!value) return;
    const sessionId = value.sessionId ?? value.session_id ?? value.sessionFile;
    if (typeof sessionId === "string" && sessionId.length > 0)
      this.sessionIdValue = sessionId;
    const usage = recordOf(value.usage);
    if (!usage) return;
    const input = usage.inputTokens ?? usage.input_tokens;
    const output = usage.outputTokens ?? usage.output_tokens;
    if (typeof input === "number") {
      this.inputTokensValue = Math.max(this.inputTokensValue, input);
      this.usageReported = true;
    }
    if (typeof output === "number") {
      this.outputTokensValue = Math.max(this.outputTokensValue, output);
      this.usageReported = true;
    }
    for (const [key, alias] of [
      ["cachedReadTokens", "cache_read_input_tokens"],
      ["cachedWriteTokens", "cache_creation_input_tokens"],
      ["thoughtTokens", "reasoning_tokens"],
      ["totalTokens", "total_tokens"],
    ] as const) {
      const count = usage[key] ?? usage[alias];
      if (typeof count === "number") this.extraUsage[key] = count;
    }
  }

  private *openToolCall(
    id: string,
    name?: string,
    meta?: Record<string, unknown>,
  ): Iterable<SerializedAcpEvent> {
    if (name) this.toolTitles.set(id, name);
    if (this.startedTools.has(id)) return;
    this.startedTools.add(id);
    const title = name ?? "tool";
    this.toolTitles.set(id, title);
    yield this.update({
      sessionUpdate: "tool_call",
      toolCallId: id,
      title,
      kind: toolKind(title),
      status: "pending",
      _meta: { ...meta, "bunny-agent/toolName": title },
    });
  }

  private updateTaskPlan(id: string, output: unknown): PlanEntry[] | undefined {
    const name = this.toolTitles
      .get(id)
      ?.toLowerCase()
      .replace(/[\s_-]/g, "");
    if (!["taskcreate", "taskupdate", "tasklist"].includes(name ?? ""))
      return undefined;
    const input = recordOf(this.completeToolInputs.get(id)) ?? {};
    let result = recordOf(output);
    if (!result && typeof output === "string") {
      try {
        result = recordOf(JSON.parse(output));
      } catch {
        const created = /^Task #(\S+) created successfully: (.+)$/m.exec(
          output,
        );
        if (created) result = { task: { id: created[1], subject: created[2] } };
      }
    }
    const makeEntry = (
      task: Record<string, unknown>,
    ): PlanEntry | undefined => {
      const content = task.subject ?? task.content;
      if (typeof content !== "string") return undefined;
      return {
        content,
        priority: "medium",
        status:
          task.status === "completed"
            ? "completed"
            : task.status === "in_progress"
              ? "in_progress"
              : "pending",
      };
    };
    if (name === "tasklist" && Array.isArray(result?.tasks)) {
      this.taskPlan.clear();
      for (const task of result.tasks) {
        const value = recordOf(task);
        const entry = value && makeEntry(value);
        if (value && typeof value.id === "string" && entry)
          this.taskPlan.set(value.id, entry);
      }
    } else if (name === "taskcreate") {
      const task = recordOf(result?.task);
      const entry = makeEntry({ ...input, ...task });
      if (typeof task?.id !== "string" || !entry) return undefined;
      this.taskPlan.set(task.id, entry);
    } else if (name === "taskupdate" && typeof input.taskId === "string") {
      if (input.status === "deleted") this.taskPlan.delete(input.taskId);
      else {
        const previous = this.taskPlan.get(input.taskId);
        const entry = makeEntry({ ...previous, ...input });
        if (!entry) return undefined;
        this.taskPlan.set(input.taskId, entry);
      }
    } else return undefined;
    return [...this.taskPlan.values()];
  }
}

function isStopReason(value: unknown): value is StopReason {
  return (
    typeof value === "string" &&
    [
      "end_turn",
      "max_tokens",
      "max_turn_requests",
      "refusal",
      "cancelled",
    ].includes(value)
  );
}

function mapFinishReason(reason: unknown): StopReason {
  if (reason === "length") return "max_tokens";
  if (reason === "error") return "refusal";
  if (reason === "abort" || reason === "cancelled") return "cancelled";
  return "end_turn";
}
