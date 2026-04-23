import type { Usage } from "@mariozechner/pi-ai";

export interface BillingModel {
  id: string;
  provider: string;
}

/**
 * Map pi-ai Usage to the shape expected by the SDK (messageMetadata.usage).
 */
export function usageToMessageMetadata(usage: Usage): Record<string, number> {
  return {
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_read_input_tokens: usage.cacheRead,
    cache_creation_input_tokens: usage.cacheWrite,
  };
}

/**
 * Accumulate tool usage from `details.usage.raw` into a tally keyed by model/provider id.
 * Each numeric field is summed across calls.
 */
export function accumulateToolUsage(
  tally: Record<string, Record<string, number>>,
  raw: Record<string, Record<string, unknown>>,
): void {
  for (const [key, row] of Object.entries(raw)) {
    const existing = tally[key];
    if (existing) {
      for (const [field, val] of Object.entries(row)) {
        if (typeof val === "number")
          existing[field] = (existing[field] ?? 0) + val;
      }
    } else {
      const nums: Record<string, number> = {};
      for (const [field, val] of Object.entries(row)) {
        if (typeof val === "number") nums[field] = val;
      }
      tally[key] = nums;
    }
  }
}

/**
 * Get usage from the last assistant message in agent_end.messages.
 *
 * Pi reports full usage per completion (not incremental),
 * so we take the last assistant message's usage as the run total.
 */
export function getUsageFromAgentEndMessages(
  messages: Array<{ role: string; usage?: Usage }>,
): Usage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.usage != null) return m.usage;
  }
  return undefined;
}
