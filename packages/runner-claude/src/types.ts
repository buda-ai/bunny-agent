/**
 * Output format types
 * - "text": Plain text output (final result only)
 * - "json": Single JSON result object
 * - "stream-json": Realtime streaming JSON (NDJSON)
 * - "stream": SSE-based AI SDK UI Data Stream format
 */
export type OutputFormat = "text" | "json" | "stream-json" | "stream";

/**
 * Base runner configuration options shared between CLI and runner
 */
export interface BaseRunnerOptions {
  /** Model to use (e.g., "claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022") */
  model: string;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Allowed tools */
  allowedTools?: string[];
  /** Resume session ID for multi-turn conversation */
  resume?: string;
  /** Approval file directory for tool approval flow (e.g., "/sandagent/approvals") */
  approvalDir?: string;
  outputFormat?: OutputFormat;
}
