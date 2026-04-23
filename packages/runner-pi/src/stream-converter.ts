import type { Usage } from "@mariozechner/pi-ai";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { ToolDetailsWithUsage } from "./tool-details.js";
import {
  accumulateToolUsage,
  type BillingModel,
  usageToMessageMetadata,
} from "./usage-metadata.js";

interface PiAISDKStreamConverterOptions {
  sessionId: string;
  model: BillingModel;
  redactText: (value: string) => string;
  normalizeToolOutput: (result: unknown) => string;
  getUsageFromAgentEndMessages: (
    messages: Array<{ role: string; usage?: Usage }>,
  ) => Usage | undefined;
  getErrorFromAgentEndMessages: (
    messages: Array<{
      role: string;
      stopReason?: string;
      errorMessage?: string;
    }>,
  ) => string | undefined;
}

function emitStreamError(errorText: string): string[] {
  const errorLine =
    "data: " + JSON.stringify({ type: "error", errorText }) + "\n\n";
  const finishLine =
    "data: " +
    JSON.stringify({ type: "finish", finishReason: "error" }) +
    "\n\n";
  return [errorLine, finishLine, "data: [DONE]\n\n"];
}

/** Extract plain text from pi's ToolResult format. */
export function extractToolResultText(result: unknown): string {
  if (result !== null && typeof result === "object") {
    const r = result as { content?: Array<{ type?: string; text?: string }> };
    if (Array.isArray(r.content) && r.content.length > 0) {
      const text = r.content
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n");
      if (text.length > 0) return text;
    }
  }
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function sseData(obj: Record<string, unknown>): string {
  return "data: " + JSON.stringify(obj) + "\n\n";
}

export class PiAISDKStreamConverter {
  private readonly messageId =
    "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  private readonly toolUsageTally: Record<string, Record<string, number>> = {};
  private activeTextPartId: string | null = null;
  private hasStarted = false;
  private hasFinished = false;

  constructor(private readonly options: PiAISDKStreamConverterOptions) {}

  get finished(): boolean {
    return this.hasFinished;
  }

  forceError(errorText: string): string[] {
    if (this.hasFinished) return [];
    return [...this.ensureStart(), ...this.finishError(errorText)];
  }

  handleEvent(event: AgentSessionEvent, aborted: boolean): string[] {
    if (this.hasFinished) return [];
    const chunks = [...this.ensureStart()];

    if (event.type === "message_start") {
      const msg = (event as { message?: { role?: string } }).message;
      if (msg?.role === "assistant") chunks.push(...this.endTextStreamIfOpen());
      return chunks;
    }
    if (event.type === "message_end") return chunks;

    if (event.type === "message_update") {
      const sub = event.assistantMessageEvent as {
        type: string;
        delta?: string;
      };
      if (sub.type === "text_start")
        chunks.push(...this.endTextStreamIfOpen(), ...this.openTextStream());
      else if (sub.type === "text_delta")
        chunks.push(...this.emitTextDelta(sub.delta));
      else if (sub.type === "toolcall_start")
        chunks.push(...this.endTextStreamIfOpen());
      return chunks;
    }

    if (event.type === "tool_execution_start") {
      chunks.push(...this.endTextStreamIfOpen());
      chunks.push(
        sseData({
          type: "tool-input-start",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          dynamic: true,
          providerExecuted: true,
        }),
        sseData({
          type: "tool-input-available",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.args,
          dynamic: true,
          providerExecuted: true,
        }),
      );
      return chunks;
    }

    if (event.type === "tool_execution_end") {
      const output = this.options.redactText(
        this.options.normalizeToolOutput(event.result),
      );
      const raw = (event.result as { details?: ToolDetailsWithUsage })?.details
        ?.usage?.raw;
      if (raw != null) accumulateToolUsage(this.toolUsageTally, raw);
      chunks.push(
        sseData({
          type: "tool-output-available",
          toolCallId: event.toolCallId,
          output,
          isError: event.isError,
          dynamic: true,
          providerExecuted: true,
        }),
      );
      return chunks;
    }

    if (event.type === "agent_end") {
      if (aborted) {
        chunks.push(...this.finishError("Run aborted by signal."));
      } else {
        const errorMsg = this.options.getErrorFromAgentEndMessages(
          event.messages,
        );
        if (errorMsg) chunks.push(...this.finishError(errorMsg));
        else
          chunks.push(
            ...this.finishSuccess(
              this.options.getUsageFromAgentEndMessages(event.messages),
            ),
          );
      }
      return chunks;
    }
    return chunks;
  }

  private ensureStart(): string[] {
    if (this.hasStarted) return [];
    this.hasStarted = true;
    return [
      sseData({ type: "start", messageId: this.messageId }),
      sseData({
        type: "message-metadata",
        messageMetadata: { sessionId: this.options.sessionId },
      }),
    ];
  }

  private newTextPartId(): string {
    return (
      "text_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2) +
      "_" +
      Math.random().toString(36).slice(2)
    );
  }

  private openTextStream(): string[] {
    this.activeTextPartId = this.newTextPartId();
    return [sseData({ type: "text-start", id: this.activeTextPartId })];
  }

  private emitTextDelta(rawDelta?: string): string[] {
    const delta = rawDelta ? this.options.redactText(rawDelta) : undefined;
    if (!delta) return [];
    const startChunk =
      this.activeTextPartId == null ? this.openTextStream() : [];
    return [
      ...startChunk,
      sseData({ type: "text-delta", id: this.activeTextPartId, delta }),
    ];
  }

  private endTextStreamIfOpen(): string[] {
    if (this.activeTextPartId == null) return [];
    const id = this.activeTextPartId;
    this.activeTextPartId = null;
    return [sseData({ type: "text-end", id })];
  }

  private finishSuccess(usage?: Usage): string[] {
    const chunks = [...this.endTextStreamIfOpen()];
    const raw: Record<string, Record<string, unknown>> = {};
    // Capture chat-level usage before tool tally may overwrite the same key.
    let chatUsage: Record<string, unknown> | undefined;
    if (usage) {
      const { id } = this.options.model;
      chatUsage = {
        type: "chat",
        ...usageToMessageMetadata(usage),
      };
      raw[id] = chatUsage;
    }
    for (const [key, tally] of Object.entries(this.toolUsageTally)) {
      raw[key] = { ...tally };
    }
    const finishPayload: Record<string, unknown> = {
      type: "finish",
      finishReason: "stop",
    };
    if (usage) {
      finishPayload.messageMetadata = { usage: { ...chatUsage, raw } };
    }
    chunks.push(sseData(finishPayload), "data: [DONE]\n\n");
    this.hasFinished = true;
    return chunks;
  }

  private finishError(errorText: string): string[] {
    this.hasFinished = true;
    return emitStreamError(errorText);
  }
}
