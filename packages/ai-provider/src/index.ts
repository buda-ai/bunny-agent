/**
 * @sandagent/ai-provider
 *
 * AI SDK provider for SandAgent - run Claude Agent SDK in isolated sandboxes.
 *
 * This package provides a LanguageModelV3 implementation that runs Claude Agent SDK
 * inside sandboxed environments (E2B, Sandock, Daytona, etc.), enabling secure
 * agentic AI workloads with file system access, code execution, and more.
 *
 * @example
 * ```typescript
 * import { createSandAgent } from '@sandagent/ai-provider';
 * import { E2BSandbox } from '@sandagent/sandbox-e2b';
 * import { generateText, streamText } from 'ai';
 *
 * // Create the provider (runner is auto-created from modelId)
 * const sandagent = createSandAgent({
 *   sandbox: new E2BSandbox({ apiKey: process.env.E2B_API_KEY! }),
 *   env: {
 *     ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
 *   },
 * });
 *
 * // Use with AI SDK
 * const { text } = await generateText({
 *   model: sandagent('sonnet'),
 *   prompt: 'Create a React component that displays a todo list',
 * });
 *
 * // Streaming works too
 * const { textStream } = await streamText({
 *   model: sandagent('sonnet'),
 *   prompt: 'Build a REST API server',
 * });
 *
 * for await (const chunk of textStream) {
 *   process.stdout.write(chunk);
 * }
 * ```
 *
 * @module @sandagent/ai-provider
 */

/**
 * Provider factory for creating SandAgent instances.
 * @see {@link createSandAgent} for creating provider instances
 */
export { createSandAgent } from "./sandagent-provider.js";

/**
 * Provider interface types.
 * @see {@link SandAgentProvider} for the provider interface
 */
export type { SandAgentProvider } from "./sandagent-provider.js";

/**
 * Language model implementation for SandAgent.
 * This class implements the AI SDK's LanguageModelV3 interface.
 */
export { SandAgentLanguageModel } from "./sandagent-language-model.js";

/**
 * Type definitions for SandAgent language models.
 * @see {@link SandAgentLanguageModelOptions} for model configuration options
 */
export type { SandAgentLanguageModelOptions } from "./sandagent-language-model.js";

/**
 * Settings and type definitions for SandAgent.
 * @see {@link SandAgentProviderSettings} for detailed configuration options
 * @see {@link SandAgentModelId} for supported model identifiers
 * @see {@link Logger} for custom logging interface
 */
export type {
  SandAgentProviderSettings,
  SandAgentModelId,
  Logger,
} from "./types.js";

/**
 * Utility function for resolving model aliases.
 */
export { resolveModelId } from "./types.js";

/**
 * Re-exports from @sandagent/core for convenience.
 * These allow users to access core types without additional imports.
 */
export type {
  SandboxAdapter,
  SandboxHandle,
  TranscriptEntry,
  Message,
} from "@sandagent/core";
