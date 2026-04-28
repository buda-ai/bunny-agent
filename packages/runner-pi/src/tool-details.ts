/**
 * Shared tool `details.usage` shape: `raw` maps a resource id (provider, model, …) to usage payload `T`.
 */
export interface ToolUsageDetails<T> {
  raw: Record<string, T>;
}

/**
 * Generic tool `details` shape: optional `usage` always follows {@link ToolUsageDetails}
 * (`raw` map), with `TRow` the payload type for each key in `raw`.
 */
export type ToolDetailsWithUsage<
  TRow extends object = Record<string, unknown>,
  TExtra extends Record<string, unknown> = Record<string, unknown>,
> = TExtra & {
  usage?: ToolUsageDetails<TRow>;
};
