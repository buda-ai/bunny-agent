import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { SandAgentOptions } from "@sandagent/manager";

/**
 * Artifact Processor result
 */
export interface ArtifactResult {
  artifactId: string;
  content: string;
  mimeType?: string;
}

/**
 * Stream writer interface for writing data parts
 */
export interface StreamWriter {
  write(chunk: {
    type: string;
    id?: string;
    data?: unknown;
    transient?: boolean;
  }): void;
}

/**
 * Artifact Processor interface
 */
export interface ArtifactProcessor {
  /**
   * Invoked when a stream part is received
   * @param event - Stream part event
   * @param sessionId - Current session ID (taskId)
   */
  onChange(event: LanguageModelV3StreamPart, sessionId: string): Promise<void>;
}

/**
 * Question structure for AskUserQuestion tool
 */
export interface Question {
  question: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

/**
 * Parameters for submitting an answer
 */
export interface SubmitAnswerParams {
  /** Tool call ID from the AskUserQuestion tool */
  toolCallId: string;
  /** Original questions from the tool */
  questions: Question[];
  /** User's answers keyed by question text */
  answers: Record<string, string>;
}

/**
 * Logger interface for custom logging.
 */
export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * CLI runner type passed to `sandagent run --runner <runnerType>`.
 */
export type SandAgentRunnerType =
  | "claude"
  | "pi"
  | "codex"
  | "gemini"
  | "opencode";

/**
 * AI Provider specific settings that extend SandAgentOptions.
 */
export interface SandAgentProviderSettings
  extends Omit<SandAgentOptions, "runner" | "sandboxId"> {
  /**
   * Which runner implementation to use: claude (default), pi, codex, gemini, opencode.
   * Maps to `sandagent run --runner <runnerType>`.
   */
  runnerType?: SandAgentRunnerType;
  /** Working directory for CLI operations inside the sandbox. */
  cwd?: string;
  /** Resume session ID for multi-turn conversation. */
  resume?: string;
  /** Enable verbose logging for debugging. */
  verbose?: boolean;
  /** Custom logger for handling warnings and errors. */
  logger?: Logger | false;
  /** Artifact processors for handling artifact events. */
  artifactProcessors?: ArtifactProcessor[];
  /** Limit the number of back-and-forth iterations */
  maxTurns?: number;
  /** Optional system prompt override (overrides template's default) */
  systemPrompt?: string;
  /** Text to append to the system prompt */
  appendSystemPrompt?: string;
  /** Additional skill paths (files or directories) for pi runner */
  skillPaths?: string[];
}

/**
 * Model identifier: user passes whatever the runner expects (e.g. Claude model id, Pi model id).
 */
export type SandAgentModelId = string;

/**
 * Determine the runner kind based on model ID (for future multi-runner support).
 */
export function getRunnerKindForModel(
  _modelId: SandAgentModelId,
): "claude-agent-sdk" {
  return "claude-agent-sdk";
}
