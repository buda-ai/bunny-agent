/**
 * @bunny-agent/sdk - Provider
 *
 * AI SDK provider for BunnyAgent - run Claude Agent SDK in isolated sandboxes.
 */

// Re-exports from @ai-sdk/provider for convenience
export type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
// Re-exports from @bunny-agent/manager for convenience
export type {
  Message,
  SandboxAdapter,
  SandboxHandle,
  TranscriptEntry,
} from "@bunny-agent/manager";
export type { BunnyAgentLanguageModelOptions } from "./bunny-agent-language-model";
export { BunnyAgentLanguageModel } from "./bunny-agent-language-model";
export type { BunnyAgentProvider } from "./bunny-agent-provider";
export { createBunnyAgent } from "./bunny-agent-provider";
export type { SubmitAnswerOptions } from "./question-processor";
export { submitAnswer } from "./question-processor";
export {
  bunnyHttpTool,
  bunnySandboxTool,
  compileToolRefsForBunny,
  streamText,
} from "./stream-text";
export type {
  ArtifactProcessor,
  ArtifactResult,
  BunnyAgentModelId,
  BunnyAgentProviderSettings,
  Logger,
  Question,
  StreamWriter,
  SubmitAnswerParams,
  ToolBridge,
  ToolGateway,
  ToolGatewayRegistration,
  ToolRuntime,
} from "./types";
export { getBunnyAgentMetadata, getBunnyAgentUsage } from "./usage";
