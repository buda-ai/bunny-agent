/**
 * Output format types
 */
export type OutputFormat = "text" | "json" | "stream-json" | "stream";

/**
 * Base runner configuration options shared between CLI and runner
 */
export interface BaseRunnerOptions {
  model: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  outputFormat?: OutputFormat;
}
