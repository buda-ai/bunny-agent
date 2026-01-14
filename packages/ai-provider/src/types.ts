import type { SandboxAdapter, TranscriptWriter } from "@sandagent/core";

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
 * Configuration settings for SandAgent AI SDK provider.
 * These settings control how the agent runs inside the sandbox.
 *
 * @example
 * ```typescript
 * const settings: SandAgentSettings = {
 *   sandbox: new E2BSandbox({ apiKey: 'xxx' }),
 *   template: 'coder',
 *   maxTurns: 10,
 *   env: {
 *     ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
 *   },
 * };
 * ```
 */
export interface SandAgentSettings {
  /**
   * Sandbox adapter to use for running the agent.
   * This is required - the provider needs a sandbox to run in.
   *
   * @example
   * ```typescript
   * import { E2BSandbox } from '@sandagent/sandbox-e2b';
   * const sandbox = new E2BSandbox({ apiKey: 'xxx' });
   * ```
   */
  sandbox: SandboxAdapter;

  /**
   * Session ID for the agent.
   * If not provided, a unique ID will be generated.
   * The same session ID allows resuming conversations.
   */
  sessionId?: string;

  /**
   * Template to use for the agent.
   * Corresponds to templates in /sandagent/templates/{template}/CLAUDE.md
   *
   * @default 'default'
   */
  template?: string;

  /**
   * Custom system prompt to override the template's CLAUDE.md.
   */
  systemPrompt?: string;

  /**
   * Maximum number of conversation turns.
   */
  maxTurns?: number;

  /**
   * Tools to explicitly allow during execution.
   * If not set, all tools are available.
   *
   * @example ['Read', 'LS', 'Bash(git log:*)']
   */
  allowedTools?: string[];

  /**
   * Working directory for CLI operations inside the sandbox.
   *
   * @default '/workspace'
   */
  cwd?: string;

  /**
   * Environment variables to pass to the sandbox.
   * Must include ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK for real API calls.
   *
   * @example
   * ```typescript
   * env: {
   *   ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
   *   GITHUB_TOKEN: process.env.GITHUB_TOKEN,
   * }
   * ```
   */
  env?: Record<string, string>;

  /**
   * Approval file directory for tool approval flow.
   * Used to enable interactive tool approval in the sandbox.
   *
   * @example '/sandagent/approvals'
   */
  approvalDir?: string;

  /**
   * Resume session ID for multi-turn conversation.
   * Obtained from previous response metadata.
   */
  resume?: string;

  /**
   * Content type for streaming response.
   *
   * @default 'text/event-stream'
   */
  contentType?: string;

  /**
   * Transcript writer for recording all streamed data.
   * Useful for debugging and logging.
   */
  transcriptWriter?: TranscriptWriter;

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
