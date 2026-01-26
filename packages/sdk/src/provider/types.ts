import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { SandAgentOptions } from "@sandagent/manager";

/**
 * Artifact Processor 返回结果
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
 * Artifact Processor 接口
 */
export interface ArtifactProcessor {
  /**
   * 当收到 stream part 时触发
   * @param event - Stream part 事件
   * @param sessionId - 当前会话 ID（taskId）
   */
  onChange(event: LanguageModelV3StreamPart, sessionId: string): Promise<void>;
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
 * AI Provider specific settings that extend SandAgentOptions.
 */
export interface SandAgentProviderSettings
  extends Omit<SandAgentOptions, "runner" | "sandboxId"> {
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
}

/**
 * Supported model identifiers for SandAgent.
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
  | "sonnet"
  | "opus"
  | "haiku"
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
 */
export function getRunnerKindForModel(
  modelId: SandAgentModelId,
): "claude-agent-sdk" {
  const resolvedId = resolveModelId(modelId);

  if (
    resolvedId.startsWith("claude") ||
    resolvedId.includes("anthropic") ||
    resolvedId.startsWith("us.anthropic")
  ) {
    return "claude-agent-sdk";
  }

  return "claude-agent-sdk";
}
