import type { Usage } from "@earendil-works/pi-ai";

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
 * Sum full, per-completion usage exactly once across the run's generations.
 * A generation preempted by steering still incurred the usage it reported.
 */
export function getUsageFromAgentEndMessages(
  messages: Array<{ role: string; usage?: Usage }>,
): Usage | undefined {
  let total: Usage | undefined;
  for (const message of messages) {
    if (message.role !== "assistant" || !message.usage) continue;
    const usage = message.usage;
    if (!total) {
      total = { ...usage, cost: { ...usage.cost } };
      continue;
    }
    total.input += usage.input;
    total.output += usage.output;
    total.cacheRead += usage.cacheRead;
    total.cacheWrite += usage.cacheWrite;
    total.totalTokens += usage.totalTokens;
    if (usage.reasoning !== undefined)
      total.reasoning = (total.reasoning ?? 0) + usage.reasoning;
    if (usage.cacheWrite1h !== undefined)
      total.cacheWrite1h = (total.cacheWrite1h ?? 0) + usage.cacheWrite1h;
    for (const key of [
      "input",
      "output",
      "cacheRead",
      "cacheWrite",
      "total",
    ] as const)
      total.cost[key] += usage.cost[key];
  }
  return total;
}
