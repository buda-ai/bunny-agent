import type { JSONValue, LanguageModelV3Usage } from "@ai-sdk/provider";

type JsonRecord = Record<string, JSONValue | undefined>;

function asRecord(value: unknown): JsonRecord | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonRecord;
}

/**
 * Extract `providerMetadata["bunny-agent"]` from an AI SDK providerMetadata object.
 */
export function getBunnyAgentMetadata(
  providerMetadata: unknown,
): JsonRecord | undefined {
  const providerMeta = asRecord(providerMetadata);
  if (providerMeta == null) return undefined;
  return asRecord(providerMeta["bunny-agent"]);
}

/**
 * Extract Bunny Agent usage payload from an AI SDK providerMetadata object.
 *
 * This returns the raw usage object emitted by Bunny Agent stream metadata,
 * e.g. `{ input_tokens, output_tokens, cache_read_input_tokens, ... }`.
 */
export function getBunnyAgentUsage(
  providerMetadata: unknown,
): LanguageModelV3Usage | undefined {
  const bunnyMeta = getBunnyAgentMetadata(providerMetadata);
  if (bunnyMeta == null) return undefined;
  return normalizeBunnyAgentUsage(bunnyMeta);
}

/**
 * Convert Bunny Agent usage metadata to AI SDK standard usage shape.
 *
 * Accepts either:
 * - a metadata object that contains `usage` plus extra fields (model/cost/image/search)
 * - or a direct usage payload in snake_case token fields.
 *
 * `raw` preserves usage fields and includes extra metadata fields when available.
 */
export function normalizeBunnyAgentUsage(
  data: unknown,
): LanguageModelV3Usage | undefined {
  const dataRecord = asRecord(data);
  if (dataRecord == null) return undefined;

  const usageSource = asRecord(dataRecord.usage ?? dataRecord);
  if (usageSource == null) return undefined;
  const hasTokenFields =
    "input_tokens" in usageSource ||
    "output_tokens" in usageSource ||
    "cache_read_input_tokens" in usageSource ||
    "cache_creation_input_tokens" in usageSource;
  if (!hasTokenFields) return undefined;

  const inputTokens =
    typeof usageSource.input_tokens === "number" ? usageSource.input_tokens : 0;
  const outputTokens =
    typeof usageSource.output_tokens === "number" ? usageSource.output_tokens : 0;
  const cacheRead =
    typeof usageSource.cache_read_input_tokens === "number"
      ? usageSource.cache_read_input_tokens
      : 0;
  const cacheWrite =
    typeof usageSource.cache_creation_input_tokens === "number"
      ? usageSource.cache_creation_input_tokens
      : 0;
  const textTokens =
    typeof usageSource.text_tokens === "number"
      ? usageSource.text_tokens
      : undefined;
  const reasoningTokens =
    typeof usageSource.reasoning_tokens === "number"
      ? usageSource.reasoning_tokens
      : undefined;
  const extraMetadata = Object.fromEntries(
    Object.entries(dataRecord).filter(([key]) => key !== "usage"),
  ) as JsonRecord;
  const raw =
    Object.keys(extraMetadata).length > 0
      ? { ...usageSource, ...extraMetadata }
      : usageSource;

  return {
    inputTokens: {
      total: inputTokens + cacheRead + cacheWrite,
      noCache: inputTokens,
      cacheRead,
      cacheWrite,
    },
    outputTokens: {
      total: outputTokens,
      text: textTokens,
      reasoning: reasoningTokens,
    },
    raw,
  };
}
