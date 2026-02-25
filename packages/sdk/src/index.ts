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

// Provider exports
export {
  createSandAgent,
  SandAgentLanguageModel,
  resolveModelId,
  submitAnswer,
} from "./provider";

export type {
  SandAgentProvider,
  SandAgentProviderSettings,
  SandAgentLanguageModelOptions,
  SandAgentModelId,
  Logger,
  ArtifactProcessor,
  ArtifactResult,
  StreamWriter,
  SubmitAnswerParams,
  SubmitAnswerOptions,
  Question,
  // Re-exports from @sandagent/manager
  SandboxAdapter,
  SandboxHandle,
  TranscriptEntry,
  Message,
  // Re-exports from @ai-sdk/provider
  LanguageModelV3StreamPart,
} from "./provider";

// Re-export LocalSandbox for convenience
export { LocalSandbox } from "@sandagent/manager";
export type { LocalSandboxOptions } from "@sandagent/manager";

// Re-export env helpers
export { buildRunnerEnv } from "@sandagent/manager";
export type { RunnerEnvParams } from "@sandagent/manager";

export const VERSION = "0.1.0";
