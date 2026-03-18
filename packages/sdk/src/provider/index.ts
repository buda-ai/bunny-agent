/**
 * @sandagent/sdk - Provider
 *
 * AI SDK provider for SandAgent - run Claude Agent SDK in isolated sandboxes.
 */

// Re-exports from @ai-sdk/provider for convenience
export type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
// Re-exports from @sandagent/manager for convenience
export type {
  Message,
  SandboxAdapter,
  SandboxHandle,
  TranscriptEntry,
} from "@sandagent/manager";
export type { SubmitAnswerOptions } from "./question-processor";
export { submitAnswer } from "./question-processor";
export type { SandAgentLanguageModelOptions } from "./sandagent-language-model";
export { SandAgentLanguageModel } from "./sandagent-language-model";
export type { SandAgentProvider } from "./sandagent-provider";
export { createSandAgent } from "./sandagent-provider";
export type {
  ArtifactProcessor,
  ArtifactResult,
  Logger,
  Question,
  SandAgentModelId,
  SandAgentProviderSettings,
  StreamWriter,
  SubmitAnswerParams,
} from "./types";
