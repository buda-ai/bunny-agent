import type { Usage } from "@mariozechner/pi-ai";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import {
  type BillingModel,
  buildFinishUsageMetadata,
  buildImageCostFromTokenTally,
  buildModelSummaries,
  buildToolUsage,
  buildWebSearchFinishMetadata,
  getToolUsageFromResult,
  llmChargeMessageMetadata,
  mergeMetadata,
} from "./usage-metadata.js";

interface PiAISDKStreamConverterOptions {
  sessionId: string;
  model: BillingModel;
  imagePricingModel: BillingModel | undefined;
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
  return [
    `data: ${JSON.stringify({ type: "error", errorText })}\n\n`,
    `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n`,
    "data: [DONE]\n\n",
  ];
}

/**
 * Extract plain text from pi's ToolResult format.
 */
export function extractToolResultText(result: unknown): string {
  if (result !== null && typeof result === "object") {
    const r = result as {
      content?: Array<{ type?: string; text?: string }>;
    };
    if (Array.isArray(r.content) && r.content.length > 0) {
      const text = r.content
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n");
      if (text.length > 0) {
        return text;
      }
    }
  }
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

export class PiAISDKStreamConverter {
  private readonly messageId =
    `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  private readonly imageToolUsage = { input_tokens: 0, output_tokens: 0 };
  private readonly webSearchUsage = {
    raw: {} as Record<string, { requests: number; fetchedPages: number }>,
  };
  private pendingAssistantCompletionUsage: Usage | undefined;
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
      if (msg?.role === "assistant") {
        this.pendingAssistantCompletionUsage = undefined;
        chunks.push(...this.endTextStreamIfOpen());
      }
      return chunks;
    }

    if (event.type === "message_end") {
      const msg = event.message as { role?: string; usage?: Usage };
      if (msg.role === "assistant" && msg.usage != null) {
        this.pendingAssistantCompletionUsage = msg.usage;
      }
      return chunks;
    }

    if (event.type === "message_update") {
      const sub = event.assistantMessageEvent as {
        type: string;
        delta?: string;
      };
      if (sub.type === "text_start") {
        chunks.push(...this.endTextStreamIfOpen(), ...this.openTextStream());
      } else if (sub.type === "text_delta") {
        chunks.push(...this.emitTextDelta(sub.delta));
      } else if (sub.type === "toolcall_start") {
        chunks.push(...this.endTextStreamIfOpen());
      }
      return chunks;
    }

    if (event.type === "tool_execution_start") {
      chunks.push(...this.endTextStreamIfOpen());
      const llmMeta =
        this.pendingAssistantCompletionUsage != null
          ? llmChargeMessageMetadata(
              this.options.model,
              this.pendingAssistantCompletionUsage,
            )
          : undefined;
      const toolInputStart: Record<string, unknown> = {
        type: "tool-input-start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        dynamic: true,
        providerExecuted: true,
      };
      if (llmMeta != null) {
        toolInputStart.callProviderMetadata = {
          "bunny-agent": llmMeta,
        };
      }
      chunks.push(`data: ${JSON.stringify(toolInputStart)}\n\n`);
      const toolInputAvail: Record<string, unknown> = {
        type: "tool-input-available",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.args,
        dynamic: true,
        providerExecuted: true,
      };
      if (llmMeta != null) {
        toolInputAvail.callProviderMetadata = {
          "bunny-agent": llmMeta,
        };
      }
      chunks.push(`data: ${JSON.stringify(toolInputAvail)}\n\n`);
      return chunks;
    }

    if (event.type === "tool_execution_end") {
      const output = this.options.redactText(
        this.options.normalizeToolOutput(event.result),
      );
      const toolUsage = getToolUsageFromResult<Record<string, number>>(
        event.result,
      );

      // Accumulate web_search usage into the run-level tally for finish metadata
      if (event.toolName === "web_search" && toolUsage != null) {
        for (const [providerId, row] of Object.entries(toolUsage.raw)) {
          const existing = this.webSearchUsage.raw[providerId];
          const r = row as { requests?: number; fetchedPages?: number };
          if (existing) {
            existing.requests += r.requests ?? 0;
            existing.fetchedPages += r.fetchedPages ?? 0;
          } else {
            this.webSearchUsage.raw[providerId] = {
              requests: r.requests ?? 0,
              fetchedPages: r.fetchedPages ?? 0,
            };
          }
        }
      }

      const toolOutputMeta = mergeMetadata(buildToolUsage(toolUsage));
      const toolOutputPayload: Record<string, unknown> = {
        type: "tool-output-available",
        toolCallId: event.toolCallId,
        output,
        isError: event.isError,
        dynamic: true,
        providerExecuted: true,
      };
      if (toolOutputMeta != null) {
        toolOutputPayload.callProviderMetadata = {
          "bunny-agent": toolOutputMeta,
        };
      }
      chunks.push(`data: ${JSON.stringify(toolOutputPayload)}\n\n`);
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
        else {
          const usage = this.options.getUsageFromAgentEndMessages(
            event.messages,
          );
          chunks.push(...this.finishSuccess(usage));
        }
      }
      return chunks;
    }
    return chunks;
  }

  private ensureStart(): string[] {
    if (this.hasStarted) return [];
    this.hasStarted = true;
    return [
      `data: ${JSON.stringify({ type: "start", messageId: this.messageId })}\n\n`,
      `data: ${JSON.stringify({ type: "message-metadata", messageMetadata: { sessionId: this.options.sessionId } })}\n\n`,
    ];
  }

  private newTextPartId(): string {
    return `text_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  }

  private openTextStream(): string[] {
    this.activeTextPartId = this.newTextPartId();
    return [
      `data: ${JSON.stringify({ type: "text-start", id: this.activeTextPartId })}\n\n`,
    ];
  }

  private emitTextDelta(rawDelta?: string): string[] {
    const delta = rawDelta ? this.options.redactText(rawDelta) : undefined;
    if (!delta) return [];
    const startChunk =
      this.activeTextPartId == null ? this.openTextStream() : [];
    return [
      ...startChunk,
      `data: ${JSON.stringify({ type: "text-delta", id: this.activeTextPartId, delta })}\n\n`,
    ];
  }

  private endTextStreamIfOpen(): string[] {
    if (this.activeTextPartId == null) return [];
    const id = this.activeTextPartId;
    this.activeTextPartId = null;
    return [`data: ${JSON.stringify({ type: "text-end", id })}\n\n`];
  }

  private finishSuccess(usage?: Usage): string[] {
    const chunks = [...this.endTextStreamIfOpen()];
    const finishPayload: {
      type: "finish";
      finishReason: string;
      messageMetadata?: Record<string, unknown>;
    } = { type: "finish", finishReason: "stop" };
    const usageMeta = buildFinishUsageMetadata(usage, this.imageToolUsage);
    const llmMeta =
      usage != null
        ? llmChargeMessageMetadata(this.options.model, usage)
        : undefined;
    const imageMeta = buildImageCostFromTokenTally(
      this.imageToolUsage,
      this.options.imagePricingModel,
    );
    const finishMeta = mergeMetadata(
      usageMeta != null ? { usage: usageMeta } : undefined,
      llmMeta != null ? { model: llmMeta.model } : undefined,
      imageMeta,
      buildWebSearchFinishMetadata(this.webSearchUsage),
      (() => {
        const models = buildModelSummaries(
          this.options.model,
          usage,
          this.options.imagePricingModel,
          this.imageToolUsage,
        );
        return models != null ? { models } : undefined;
      })(),
    );
    if (finishMeta != null) finishPayload.messageMetadata = finishMeta;
    chunks.push(
      `data: ${JSON.stringify(finishPayload)}\n\n`,
      "data: [DONE]\n\n",
    );
    this.hasFinished = true;
    return chunks;
  }

  private finishError(errorText: string): string[] {
    this.hasFinished = true;
    return emitStreamError(errorText);
  }
}
