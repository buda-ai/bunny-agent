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
  RunnerEnvParams,
  RunnerType,
} from "@bunny-agent/manager";
// Re-export env helpers
export {
  buildRunnerEnv,
  DEFAULT_BUNNY_AGENT_DAEMON_URL,
  isBunnyAgentDaemonHealthy,
} from "@bunny-agent/manager";
export type {
  LocalMachineOptions,
  LocalSandboxOptions,
} from "@bunny-agent/sandbox-local";
// Re-export the local adapters for convenience (LocalSandbox is the
// deprecated pre-rename alias of LocalMachine)
export { LocalMachine, LocalSandbox } from "@bunny-agent/sandbox-local";
export type {
  SrtIsolationOptions,
  SrtSandboxOptions,
} from "@bunny-agent/sandbox-srt";
export { SrtSandbox } from "@bunny-agent/sandbox-srt";
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
  TranscriptMessage,
} from "./provider";
// Provider exports
export {
  BunnyAgentLanguageModel,
  bunnyHttpTool,
  bunnySandboxTool,
  createBunnyAgent,
  getBunnyAgentMetadata,
  getBunnyAgentUsage,
  serializeTranscriptToUserInput,
  submitAnswer,
} from "./provider";

export const VERSION = "0.1.0";
