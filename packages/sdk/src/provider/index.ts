/**
 * @sandagent/sdk - Provider
 *
 * AI SDK provider for SandAgent - run Claude Agent SDK in isolated sandboxes.
 */

export { createSandAgent } from "./sandagent-provider";
export type { SandAgentProvider } from "./sandagent-provider";

export { SandAgentLanguageModel } from "./sandagent-language-model";
export type { SandAgentLanguageModelOptions } from "./sandagent-language-model";

export { submitAnswer } from "./question-processor";
export type { SubmitAnswerOptions } from "./question-processor";

export type {
  SandAgentProviderSettings,
  SandAgentModelId,
  Logger,
  ArtifactProcessor,
  ArtifactResult,
  StreamWriter,
  SubmitAnswerParams,
  Question,
} from "./types";

// Re-exports from @sandagent/manager for convenience
export type {
  SandboxAdapter,
  SandboxHandle,
  TranscriptEntry,
  Message,
} from "@sandagent/manager";

// Re-exports from @ai-sdk/provider for convenience
export type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
