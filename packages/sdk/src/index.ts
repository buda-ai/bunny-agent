/**
 * @sandagent/sdk
 *
 * SandAgent SDK - AI Provider and React hooks for building AI chat interfaces.
 *
 * Main entry point exports the AI provider (backend).
 * React hooks are available via "@sandagent/sdk/react".
 *
 * @example
 * ```typescript
 * // Backend - Provider
 * import { createSandAgent } from "@sandagent/sdk";
 * const sandagent = createSandAgent({ sandbox, env });
 * const model = sandagent("sonnet");
 *
 * // Frontend - React hooks
 * import { useSandAgentChat } from "@sandagent/sdk/react";
 * const { messages, sendMessage } = useSandAgentChat({ apiEndpoint: "/api/ai" });
 * ```
 */

export type {
  IsSandagentDaemonHealthyOptions,
  LocalSandboxOptions,
  RunnerEnvParams,
  RunnerType,
} from "@sandagent/manager";
// Re-export LocalSandbox for convenience
// Re-export env helpers
export {
  buildRunnerEnv,
  DEFAULT_SANDAGENT_DAEMON_URL,
  isSandagentDaemonHealthy,
  LocalSandbox,
} from "@sandagent/manager";
export type {
  ArtifactProcessor,
  ArtifactResult,
  // Re-exports from @ai-sdk/provider
  LanguageModelV3StreamPart,
  Logger,
  Message,
  Question,
  SandAgentLanguageModelOptions,
  SandAgentModelId,
  SandAgentProvider,
  SandAgentProviderSettings,
  // Re-exports from @sandagent/manager
  SandboxAdapter,
  SandboxHandle,
  StreamWriter,
  SubmitAnswerOptions,
  SubmitAnswerParams,
  TranscriptEntry,
} from "./provider";
// Provider exports
export {
  createSandAgent,
  SandAgentLanguageModel,
  submitAnswer,
} from "./provider";

export const VERSION = "0.1.0";
