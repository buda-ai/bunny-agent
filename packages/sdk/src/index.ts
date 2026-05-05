/**
 * @bunny-agent/sdk
 *
 * BunnyAgent SDK - AI Provider and React hooks for building AI chat interfaces.
 *
 * Main entry point exports the AI provider (backend).
 * React hooks are available via "@bunny-agent/sdk/react".
 *
 * @example
 * ```typescript
 * // Backend - Provider
 * import { createBunnyAgent } from "@bunny-agent/sdk";
 * const bunnyAgent = createBunnyAgent({ sandbox, env });
 * const model = bunnyAgent("sonnet");
 *
 * // Frontend - React hooks
 * import { useBunnyAgentChat } from "@bunny-agent/sdk/react";
 * const { messages, sendMessage } = useBunnyAgentChat({ apiEndpoint: "/api/ai" });
 * ```
 */

export type {
  IsBunnyAgentDaemonHealthyOptions,
  LocalSandboxOptions,
  RunnerEnvParams,
  RunnerType,
} from "@bunny-agent/manager";
// Re-export LocalSandbox for convenience
// Re-export env helpers
export {
  buildRunnerEnv,
  DEFAULT_BUNNY_AGENT_DAEMON_URL,
  isBunnyAgentDaemonHealthy,
  LocalSandbox,
} from "@bunny-agent/manager";
export type {
  ArtifactProcessor,
  ArtifactResult,
  BunnyAgentLanguageModelOptions,
  BunnyAgentModelId,
  BunnyAgentProvider,
  BunnyAgentProviderSettings,
  // Re-exports from @ai-sdk/provider
  LanguageModelV3StreamPart,
  Logger,
  Message,
  Question,
  // Re-exports from @bunny-agent/manager
  SandboxAdapter,
  SandboxHandle,
  StreamWriter,
  SubmitAnswerOptions,
  SubmitAnswerParams,
  ToolRuntime,
  TranscriptEntry,
} from "./provider";
// Provider exports
export {
  bunnyHttpTool,
  bunnySandboxTool,
  BunnyAgentLanguageModel,
  createBunnyAgent,
  getBunnyAgentMetadata,
  getBunnyAgentUsage,
  submitAnswer,
} from "./provider";

export const VERSION = "0.1.0";
