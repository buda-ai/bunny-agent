import type { SandAgentOptions, SandboxAdapter } from "@sandagent/manager";

/**
 * Logger interface for custom logging.
 * Allows consumers to provide their own logging implementation
 * or disable logging entirely.
 *
 * @example
 * ```typescript
 * const customLogger: Logger = {
 *   debug: (message) => myLoggingService.debug(message),
 *   info: (message) => myLoggingService.info(message),
 *   warn: (message) => myLoggingService.warn(message),
 *   error: (message) => myLoggingService.error(message),
 * };
 * ```
 */
export interface Logger {
  /**
   * Log a debug message. Only logged when verbose mode is enabled.
   * Used for detailed execution tracing and troubleshooting.
   */
  debug: (message: string) => void;

  /**
   * Log an informational message. Only logged when verbose mode is enabled.
   * Used for general execution flow information.
   */
  info: (message: string) => void;

  /**
   * Log a warning message.
   */
  warn: (message: string) => void;

  /**
   * Log an error message.
   */
  error: (message: string) => void;
}

/**
 * AI Provider specific settings that extend SandAgentOptions.
 * These are used for stream input configuration and logging.
 *
 * Note: Runner is automatically created based on modelId in createModel.
 * No need to provide runner configuration.
 * sandboxId is also automatically generated if not provided.
 */
export interface SandAgentProviderSettings
  extends Omit<SandAgentOptions, "runner" | "sandboxId"> {
  /**
   * Unique identifier for the sandbox instance.
   * If not provided, will be auto-generated based on timestamp.
   *
   * @default `ai-sdk-${Date.now()}`
   */
  sandboxId?: string;

  /**
   * Working directory for CLI operations inside the sandbox.
   *
   * @default '/workspace'
   */
  cwd?: string;

  /**
   * Resume session ID for multi-turn conversation.
   * Obtained from previous response metadata.
   */
  resume?: string;

  /**
   * Enable verbose logging for debugging.
   *
   * @default false
   */
  verbose?: boolean;

  /**
   * Custom logger for handling warnings and errors.
   * - Set to `false` to disable all logging
   * - Provide a Logger object to use custom logging
   * - Leave undefined to use console (default)
   *
   * @default console
   */
  logger?: Logger | false;
}

/**
 * Supported model identifiers for SandAgent.
 * The provider supports any Claude model that the underlying Claude Agent SDK supports.
 */
export type SandAgentModelId =
  | "claude-sonnet-4-20250514"
  | "claude-opus-4-20250514"
  | "claude-sonnet-4.5-20250514"
  | "claude-opus-4.5-20250514"
  | "claude-4-5-sonnet-20250514"
  | "claude-4-5-opus-20250514"
  | "claude-3-7-sonnet-20250219"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-5-haiku-20241022"
  | "claude-3-opus-20240229"
  | "claude-3-sonnet-20240229"
  | "claude-3-haiku-20240307"
  // Convenience aliases
  | "sonnet"
  | "opus"
  | "haiku"
  // Allow any custom model string
  | (string & {});

/**
 * Maps model aliases to full model IDs
 */
export function resolveModelId(modelId: SandAgentModelId): string {
  switch (modelId) {
    case "sonnet":
      return "claude-sonnet-4-20250514";
    case "opus":
      return "claude-opus-4-20250514";
    case "haiku":
      return "claude-3-5-haiku-20241022";
    default:
      return modelId;
  }
}

/**
 * Determine the runner kind based on model ID
 * @param modelId - The model identifier
 * @returns The runner kind to use
 */
export function getRunnerKindForModel(
  modelId: SandAgentModelId,
): "claude-agent-sdk" {
  const resolvedId = resolveModelId(modelId);

  // Check if it's a Claude model (all current models are Claude)
  if (
    resolvedId.startsWith("claude") ||
    resolvedId.includes("anthropic") ||
    resolvedId.startsWith("us.anthropic")
  ) {
    return "claude-agent-sdk";
  }

  // Future: Add codex detection here
  // if (resolvedId.startsWith("codex") || ...) {
  //   return "codex-agent-sdk";
  // }

  // Default to claude for now (all current models are Claude)
  return "claude-agent-sdk";
}
