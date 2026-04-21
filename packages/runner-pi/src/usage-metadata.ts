import type { Usage } from "@mariozechner/pi-ai";
import type { WebSearchUsageDetails } from "./web-tools.js";

export interface ImageTokenTally {
  input_tokens: number;
  output_tokens: number;
}

interface ModelRef {
  provider: string;
  modelId: string;
}

/**
 * Fragment merged into SSE `messageMetadata` (tool events and `finish`).
 *
 * - **Chat (per assistant turn):** `usage` (snake_case tokens), `model` (`ModelRef`).
 * - **Tool usage:** `toolUsage` — same shape as tool `details.usage` (`{ raw: ... }`);
 *   optional `imageModel` (`ModelRef`) when a catalog image model is resolved.
 *   finish merges all providers into one `raw` map (same structure, aggregated counts).
 */
export type MessageMetadata = Record<string, unknown>;

export function buildToolUsage<TRow extends object>(
  usage: { raw: Record<string, TRow> } | undefined,
): MessageMetadata | undefined {
  if (usage == null || Object.keys(usage.raw).length === 0) return undefined;
  return { toolUsage: usage };
}

export function getToolUsageFromResult<TRow extends object>(
  result: unknown,
): { raw: Record<string, TRow> } | undefined {
  if (result == null || typeof result !== "object") return undefined;
  const details = (result as { details?: { usage?: { raw?: unknown } } }).details;
  const usage = details?.usage;
  if (usage == null || typeof usage !== "object") return undefined;
  if (usage.raw == null || typeof usage.raw !== "object") return undefined;
  return usage as { raw: Record<string, TRow> };
}

export interface UsageMetadataShape {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  total_tokens?: number;
}

export interface ModelUsageSummary {
  type: "chat" | "image";
  provider: string;
  modelId: string;
  usage: UsageMetadataShape;
}

export interface BillingModel {
  id: string;
  provider: string;
}

/**
 * Map pi-ai Usage to the shape expected by the SDK (messageMetadata.usage).
 * SDK convertUsage accepts input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens.
 */
export function usageToMessageMetadata(usage: Usage): Record<string, number> {
  return {
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_read_input_tokens: usage.cacheRead,
    cache_creation_input_tokens: usage.cacheWrite,
  };
}

/** Stable reference for billing: Pi catalog `Model` id + provider slug. */
export function modelRef(model: { id: string; provider: string }): ModelRef {
  return { provider: String(model.provider), modelId: model.id };
}

/** Token + model ref for one LLM completion (chat). */
export function llmChargeMessageMetadata(
  model: BillingModel,
  usage: Usage,
): MessageMetadata {
  return {
    usage: usageToMessageMetadata(usage),
    model: modelRef(model),
  };
}

export function usageFromTokenTotals(
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
): Usage {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

export function buildWebSearchFinishMetadata(
  tally: WebSearchUsageDetails,
): MessageMetadata | undefined {
  return buildToolUsage(tally);
}

export function buildImageCostFromTokenTally(
  imageTokenTally: ImageTokenTally,
  imagePricingModel: BillingModel | null | undefined,
): MessageMetadata | undefined {
  if (imagePricingModel == null) return undefined;
  const hasImageUsage =
    imageTokenTally.input_tokens > 0 || imageTokenTally.output_tokens > 0;
  if (!hasImageUsage) return undefined;
  return { imageModel: modelRef(imagePricingModel) };
}

export function mergeMetadata(
  ...metadataParts: Array<MessageMetadata | undefined>
): MessageMetadata | undefined {
  const merged: MessageMetadata = {};
  for (const part of metadataParts) {
    if (part != null) {
      Object.assign(merged, part);
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function buildFinishUsageMetadata(
  usage: Usage | undefined,
  imageTokenTally: ImageTokenTally,
): Record<string, number> | undefined {
  const hasImageUsage =
    imageTokenTally.input_tokens > 0 || imageTokenTally.output_tokens > 0;
  if (usage == null && !hasImageUsage) return undefined;
  const base = usage != null ? usageToMessageMetadata(usage) : {};
  return {
    ...base,
    input_tokens: (base.input_tokens ?? 0) + imageTokenTally.input_tokens,
    output_tokens: (base.output_tokens ?? 0) + imageTokenTally.output_tokens,
  };
}

function toImageUsageMetadata(
  imageTokenTally: ImageTokenTally,
): UsageMetadataShape | undefined {
  if (
    imageTokenTally.input_tokens <= 0 &&
    imageTokenTally.output_tokens <= 0
  ) {
    return undefined;
  }
  const total = imageTokenTally.input_tokens + imageTokenTally.output_tokens;
  return {
    input_tokens: imageTokenTally.input_tokens,
    output_tokens: imageTokenTally.output_tokens,
    total_tokens: total,
  };
}

export function buildModelSummaries(
  chatModel: BillingModel,
  llmUsage: Usage | undefined,
  imageModel: BillingModel | null | undefined,
  imageTokenTally: ImageTokenTally,
): ModelUsageSummary[] | undefined {
  const models: ModelUsageSummary[] = [];
  if (llmUsage != null) {
    models.push({
      type: "chat",
      ...modelRef(chatModel),
      usage: usageToMessageMetadata(llmUsage),
    });
  }
  const imageUsage = toImageUsageMetadata(imageTokenTally);
  if (imageModel != null && imageUsage != null) {
    models.push({
      type: "image",
      ...modelRef(imageModel),
      usage: imageUsage,
    });
  }
  return models.length > 0 ? models : undefined;
}

/**
 * Sum usage across all assistant messages in agent_end.messages.
 * Each assistant message represents one completion turn; finish usage should
 * represent the full run, not only the final assistant completion.
 */
export function getUsageFromAgentEndMessages(
  messages: Array<{ role: string; usage?: Usage }>,
): Usage | undefined {
  const summed = usageFromTokenTotals(0, 0, 0, 0);
  let found = false;
  for (const m of messages) {
    if (m.role === "assistant" && m.usage != null) {
      found = true;
      summed.input += m.usage.input;
      summed.output += m.usage.output;
      summed.cacheRead += m.usage.cacheRead;
      summed.cacheWrite += m.usage.cacheWrite;
      summed.totalTokens += m.usage.totalTokens;
    }
  }
  return found ? summed : undefined;
}
