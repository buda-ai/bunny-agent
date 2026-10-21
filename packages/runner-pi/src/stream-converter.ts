import type { WebSearchCallRecord } from "@bunny-agent/manager/contracts";
import { isValidWebSearchCallRecord } from "@bunny-agent/manager/contracts";
import { buildWebSearchFailureRecord } from "@bunny-agent/manager/contracts/record";
import type { Usage } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  type CitationMode,
  CitationTextProcessor,
  type NativeCitationInput,
} from "./citation-processor.js";
import { SourceRegistry } from "./source-registry.js";
import type { ToolDetailsWithUsage } from "./tool-details.js";
import {
  accumulateToolUsage,
  type BillingModel,
  usageToMessageMetadata,
} from "./usage-metadata.js";

interface PiAISDKStreamConverterOptions {
  searchContractVersion?: 1;
  sourceRegistry?: SourceRegistry;
  /** Supported adapter/fixture boundary only; current Pi always uses explicit-marker. */
  citationMode?: CitationMode;
  sessionId: string;
  model: BillingModel;
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

const ASK_USER_QUESTION_TOOL_NAMES = new Set([
  "AskUserQuestion",
  "ask_user_question",
]);
const ASK_USER_QUESTION_TIMEOUT_ANSWER_KEY = "__bunny_agent_timeout__";
const WEB_SEARCH_TOOL_NAMES = new Set(["web_search"]);

function hasOwn(value: object, key: PropertyKey): boolean {
  // biome-ignore lint/suspicious/noPrototypeBuiltins: This package targets ES2020, which lacks Object.hasOwn.
  return Object.prototype.hasOwnProperty.call(value, key);
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

function extractAskUserQuestionOutput(
  toolName: string,
  result: unknown,
): { answers: Record<string, unknown> } | undefined {
  if (!ASK_USER_QUESTION_TOOL_NAMES.has(toolName)) return undefined;
  if (result === null || typeof result !== "object") return undefined;

  const details = (result as { details?: unknown }).details;
  if (
    details === null ||
    typeof details !== "object" ||
    Array.isArray(details)
  ) {
    return undefined;
  }

  const answers = (details as { answers?: unknown }).answers;
  if (
    answers === null ||
    typeof answers !== "object" ||
    Array.isArray(answers)
  ) {
    return undefined;
  }

  return {
    answers: Object.fromEntries(
      Object.entries(answers as Record<string, unknown>).filter(
        ([key]) => key !== ASK_USER_QUESTION_TIMEOUT_ANSWER_KEY,
      ),
    ),
  };
}

/** Only explicit structured carriers or a whole canonical tool-ref JSON value are metadata. */
function extractWebSearchOutput(
  toolName: string,
  result: unknown,
  enabled: boolean,
): {
  record?: WebSearchCallRecord;
  invalid?: boolean;
  usage?: Record<string, Record<string, unknown>>;
} {
  if (!enabled || !WEB_SEARCH_TOOL_NAMES.has(toolName)) return {};
  const object =
    result !== null && typeof result === "object"
      ? (result as Record<string, unknown>)
      : undefined;
  const details = object?.details;
  let candidate: unknown;
  let serializedUsage: unknown;
  let recognized = false;
  if (
    details !== null &&
    typeof details === "object" &&
    hasOwn(details, "web_search")
  ) {
    candidate = (details as { web_search?: unknown }).web_search;
    recognized = true;
  } else {
    let payload: unknown = object;
    const content = object?.content;
    const text =
      typeof result === "string"
        ? result
        : Array.isArray(content) &&
            content.length === 1 &&
            content[0]?.type === "text" &&
            typeof content[0].text === "string"
          ? content[0].text
          : undefined;
    if (text !== undefined) {
      if (text.length > 256_000)
        return text.trimStart().startsWith("{") ? { invalid: true } : {};
      try {
        payload = JSON.parse(text);
      } catch {
        return {};
      }
    }
    if (
      payload !== null &&
      typeof payload === "object" &&
      !Array.isArray(payload)
    ) {
      const value = payload as Record<string, unknown>;
      if (
        value.details !== null &&
        typeof value.details === "object" &&
        hasOwn(value.details, "web_search")
      ) {
        candidate = (value.details as { web_search?: unknown }).web_search;
        serializedUsage = (value.details as ToolDetailsWithUsage).usage?.raw;
        recognized = true;
      } else if (
        value.type === "web_search_call" ||
        hasOwn(value, "schema_version")
      ) {
        candidate = value;
        recognized = true;
      }
    }
  }
  if (!recognized) return {};
  if (!isValidWebSearchCallRecord(candidate)) return { invalid: true };
  const usage =
    serializedUsage !== null &&
    typeof serializedUsage === "object" &&
    !Array.isArray(serializedUsage) &&
    Object.values(serializedUsage).every(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        Object.values(row).every(
          (value) => typeof value !== "number" || Number.isFinite(value),
        ),
    )
      ? (serializedUsage as Record<string, Record<string, unknown>>)
      : undefined;
  return { record: candidate, usage };
}

function sseData(obj: Record<string, unknown>): string {
  return "data: " + JSON.stringify(obj) + "\n\n";
}

export function getProviderStopReasonFromAgentEndMessages(
  messages: Array<{ role: string; stopReason?: string }>,
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.stopReason) {
      return message.stopReason;
    }
  }
  return undefined;
}

export class PiAISDKStreamConverter {
  private readonly messageId =
    "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  private readonly toolUsageTally: Record<string, Record<string, number>> =
    Object.create(null);
  private readonly toolQueries = new Map<string, string>();
  private activeTextPartId: string | null = null;
  private hasStarted = false;
  private hasFinished = false;
  private textProcessor: CitationTextProcessor | undefined;
  private readonly registry: SourceRegistry;
  private readonly numbering = new Map<string, number>();
  private readonly emittedSources = new Set<string>();
  private currentContentIndex: number | undefined;
  private lastEndedContentIndex = -1;
  private textInputEnded = false;

  constructor(private readonly options: PiAISDKStreamConverterOptions) {
    this.registry = options.sourceRegistry ?? new SourceRegistry();
  }

  /** Ingest only against an active text part in its already selected mode. */
  ingestNativeAnnotations(input: NativeCitationInput): void {
    if (!this.hasFinished) this.textProcessor?.ingestNative(input);
  }

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
        chunks.push(...this.endTextStreamIfOpen());
        this.currentContentIndex = undefined;
        this.lastEndedContentIndex = -1;
      }
      return chunks;
    }
    if (event.type === "message_end") {
      if (
        this.options.searchContractVersion === 1 &&
        event.message.role === "assistant"
      ) {
        chunks.push(
          ...this.endTextStreamIfOpen(
            aborted ||
              ["length", "aborted", "error"].includes(event.message.stopReason),
          ),
        );
      }
      return chunks;
    }

    if (event.type === "message_update") {
      if (event.message?.role && event.message.role !== "assistant")
        return chunks;
      const sub = event.assistantMessageEvent as {
        type: string;
        delta?: string;
        contentIndex?: number;
      };
      if (sub.type === "text_start") {
        if (
          sub.contentIndex !== undefined &&
          (sub.contentIndex <= this.lastEndedContentIndex ||
            this.currentContentIndex === sub.contentIndex)
        )
          return chunks;
        chunks.push(...this.endTextStreamIfOpen());
        this.currentContentIndex = sub.contentIndex;
        chunks.push(...this.openTextStream());
      } else if (sub.type === "text_delta") {
        if (
          sub.contentIndex !== undefined &&
          sub.contentIndex <= this.lastEndedContentIndex
        )
          return chunks;
        if (this.textInputEnded) return chunks;
        this.currentContentIndex ??= sub.contentIndex;
        chunks.push(...this.emitTextDelta(sub.delta));
      } else if (sub.type === "text_end") {
        if (
          sub.contentIndex !== undefined &&
          (sub.contentIndex <= this.lastEndedContentIndex ||
            (this.currentContentIndex !== undefined &&
              sub.contentIndex !== this.currentContentIndex))
        )
          return chunks;
        // The provider's final stop reason arrives at message_end. Keep the
        // terminal metadata open until then so length/abort can be reported.
        if (this.options.searchContractVersion === 1)
          this.textInputEnded = true;
      } else if (sub.type === "toolcall_start" || sub.type === "thinking_start")
        chunks.push(...this.endTextStreamIfOpen());
      return chunks;
    }

    if (event.type === "tool_execution_start") {
      if (
        this.options.searchContractVersion === 1 &&
        event.toolName === "web_search"
      ) {
        const query = (event.args as { query?: unknown } | undefined)?.query;
        if (typeof query === "string")
          this.toolQueries.set(event.toolCallId, query);
      }
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
      const textOutput = this.options.normalizeToolOutput(event.result);
      const raw = (event.result as { details?: ToolDetailsWithUsage })?.details
        ?.usage?.raw;
      if (raw != null) accumulateToolUsage(this.toolUsageTally, raw);
      const inspection = extractWebSearchOutput(
        event.toolName,
        event.result,
        this.options.searchContractVersion === 1,
      );
      if (raw == null && inspection.usage)
        accumulateToolUsage(this.toolUsageTally, inspection.usage);
      const boundSearch =
        inspection.invalid ||
        (event.isError && inspection.record?.status === "completed")
          ? buildWebSearchFailureRecord({
              id: event.toolCallId,
              query: this.toolQueries.get(event.toolCallId) ?? "",
              provider: "protocol",
              error: {
                code: "invalid_request",
                message: "Invalid structured web search result.",
                retryable: false,
              },
            })
          : inspection.record
            ? { ...inspection.record, id: event.toolCallId }
            : undefined;
      this.toolQueries.delete(event.toolCallId);
      const failedSearch =
        boundSearch?.status === "failed" ? boundSearch : undefined;
      if (
        this.options.searchContractVersion === 1 &&
        boundSearch?.status === "completed" &&
        !event.isError
      ) {
        this.registry.registerSearch(boundSearch);
      }
      if (event.isError || failedSearch) {
        chunks.push(
          sseData({
            type: "tool-output-error",
            toolCallId: event.toolCallId,
            errorText: failedSearch?.error.message ?? textOutput,
            ...(failedSearch
              ? {
                  providerMetadata: {
                    "bunny-agent": { search_result: failedSearch },
                  },
                }
              : {}),
            dynamic: true,
            providerExecuted: true,
          }),
        );
      } else {
        const output =
          extractAskUserQuestionOutput(event.toolName, event.result) ??
          boundSearch ??
          textOutput;
        chunks.push(
          sseData({
            type: "tool-output-available",
            toolCallId: event.toolCallId,
            output,
            dynamic: true,
            providerExecuted: true,
          }),
        );
      }
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
          const providerStopReason = getProviderStopReasonFromAgentEndMessages(
            event.messages,
          );
          chunks.push(
            ...this.finishSuccess(
              this.options.getUsageFromAgentEndMessages(event.messages),
              providerStopReason === "length" ? "length" : "stop",
              providerStopReason,
            ),
          );
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
      sseData({ type: "start", messageId: this.messageId }),
      sseData({
        type: "message-metadata",
        messageMetadata: {
          sessionId: this.options.sessionId,
          ...(this.options.searchContractVersion === 1
            ? {
                searchContract: {
                  version: 1,
                  structured_retrieval: true,
                  native_annotations: false,
                  explicit_source_marker_annotations: true,
                },
              }
            : {}),
        },
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
    this.textInputEnded = false;
    this.activeTextPartId = this.newTextPartId();
    if (this.options.searchContractVersion === 1) {
      this.textProcessor = new CitationTextProcessor(
        this.activeTextPartId,
        this.options.citationMode ?? "explicit-marker",
        this.registry,
        this.numbering,
      );
    }
    return [sseData({ type: "text-start", id: this.activeTextPartId })];
  }

  private emitTextDelta(rawDelta?: string): string[] {
    if (!rawDelta) return [];
    const startChunk =
      this.activeTextPartId == null ? this.openTextStream() : [];
    const delta = this.textProcessor?.push(rawDelta) ?? rawDelta;
    return [
      ...startChunk,
      ...(delta
        ? [
            sseData({
              type: "text-delta",
              id: this.activeTextPartId,
              delta,
            }),
          ]
        : []),
    ];
  }

  private endTextStreamIfOpen(partial = false): string[] {
    if (this.activeTextPartId == null) return [];
    const id = this.activeTextPartId;
    const chunks: string[] = [];
    const processor = this.textProcessor;
    if (processor) {
      const suffix = processor.finish(partial);
      if (suffix)
        chunks.push(sseData({ type: "text-delta", id, delta: suffix }));
      for (const binding of processor.metadata.bindings) {
        if (this.emittedSources.has(binding.source_id)) continue;
        const annotation =
          processor.metadata.annotations[binding.annotation_index];
        this.emittedSources.add(binding.source_id);
        chunks.push(
          sseData({
            type: "source-url",
            sourceId: binding.source_id,
            url: annotation.url,
            title: annotation.title,
          }),
        );
      }
    }
    if (this.currentContentIndex !== undefined)
      this.lastEndedContentIndex = Math.max(
        this.lastEndedContentIndex,
        this.currentContentIndex,
      );
    this.currentContentIndex = undefined;
    this.textProcessor = undefined;
    this.textInputEnded = false;
    this.activeTextPartId = null;
    chunks.push(
      sseData({
        type: "text-end",
        id,
        ...(processor
          ? {
              providerMetadata: {
                "bunny-agent": {
                  sessionId: this.options.sessionId,
                  citation_contract: processor.metadata,
                },
              },
            }
          : {}),
      }),
    );
    return chunks;
  }

  private finishSuccess(
    usage?: Usage,
    finishReason: "stop" | "length" = "stop",
    providerStopReason?: string,
  ): string[] {
    const chunks = [...this.endTextStreamIfOpen(finishReason === "length")];
    const raw: Record<string, Record<string, unknown>> = Object.create(null);
    const messageMetadata: Record<string, unknown> = {};
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
      finishReason,
    };
    if (usage || Object.keys(this.toolUsageTally).length > 0) {
      messageMetadata.usage = { ...chatUsage, raw };
    }
    if (providerStopReason) {
      messageMetadata.providerStopReason = providerStopReason;
    }
    if (Object.keys(messageMetadata).length > 0) {
      finishPayload.messageMetadata = messageMetadata;
    }
    chunks.push(sseData(finishPayload), "data: [DONE]\n\n");
    this.hasFinished = true;
    return chunks;
  }

  private finishError(errorText: string): string[] {
    const chunks = this.endTextStreamIfOpen(true);
    this.hasFinished = true;
    return [...chunks, ...emitStreamError(errorText)];
  }
}
