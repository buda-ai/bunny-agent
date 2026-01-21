import type {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV3,
  ProviderV3,
} from "@ai-sdk/provider";
import { NoSuchModelError } from "@ai-sdk/provider";
import type { RunnerSpec } from "@sandagent/manager";
import { SandAgentLanguageModel } from "./sandagent-language-model.js";
import type { Logger, SandAgentModelId } from "./types.js";
import {
  type SandAgentProviderSettings,
  getRunnerKindForModel,
  resolveModelId,
} from "./types.js";

// Re-export for convenience
export type { SandAgentProviderSettings } from "./types.js";

/**
 * SandAgent provider interface that extends the AI SDK's ProviderV3.
 * Provides methods to create language models for running Claude Agent SDK in sandboxes.
 *
 * @example
 * ```typescript
 * import { createSandAgent } from '@sandagent/ai-provider';
 * import { E2BSandbox } from '@sandagent/sandbox-e2b';
 *
 * const sandagent = createSandAgent({
 *   sandbox: new E2BSandbox({ apiKey: 'xxx' }),
 *   env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
 * });
 *
 * // Create a model instance
 * const model = sandagent('sonnet');
 *
 * // Or use the explicit methods
 * const chatModel = sandagent.chat('opus');
 * const languageModel = sandagent.languageModel('sonnet', { maxTurns: 10 });
 * ```
 */
export interface SandAgentProvider extends ProviderV3 {
  /**
   * Creates a language model instance for the specified model ID.
   * This is a shorthand for calling `languageModel()`.
   *
   * @param modelId - The Claude model to use ('opus', 'sonnet', 'haiku', or full model ID)
   * @param options - Optional additional options to merge with defaults
   * @returns A language model instance
   */
  (
    modelId: SandAgentModelId,
    options?: Partial<SandAgentProviderSettings>,
  ): LanguageModelV3;

  /**
   * Creates a language model instance for text generation.
   *
   * @param modelId - The Claude model to use
   * @param options - Optional additional options to merge with defaults
   * @returns A language model instance
   */
  languageModel(
    modelId: SandAgentModelId,
    options?: Partial<SandAgentProviderSettings>,
  ): LanguageModelV3;

  /**
   * Alias for `languageModel()` to maintain compatibility with AI SDK patterns.
   *
   * @param modelId - The Claude model to use
   * @param options - Optional additional options to merge with defaults
   * @returns A language model instance
   */
  chat(
    modelId: SandAgentModelId,
    options?: Partial<SandAgentProviderSettings>,
  ): LanguageModelV3;

  /**
   * Throws an error - SandAgent does not support embedding models.
   */
  embeddingModel(modelId: string): EmbeddingModelV3;

  /**
   * Throws an error - SandAgent does not support text embedding models.
   */
  textEmbeddingModel(modelId: string): EmbeddingModelV3;

  /**
   * Throws an error - SandAgent does not support image models.
   */
  imageModel(modelId: string): ImageModelV3;
}

/**
 * Get a logger instance based on settings.
 */
function getLogger(settings: Partial<SandAgentProviderSettings>): Logger {
  if (settings.logger === false) {
    return {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  if (settings.logger) {
    return settings.logger;
  }

  // Default console logger
  const isVerbose = settings.verbose ?? false;
  return {
    debug: (msg) => isVerbose && console.debug(msg),
    info: (msg) => isVerbose && console.info(msg),
    warn: (msg) => console.warn(msg),
    error: (msg) => console.error(msg),
  };
}

/**
 * Creates a SandAgent provider instance with the specified configuration.
 * The provider can be used to create language models that run Claude Agent SDK
 * inside isolated sandbox environments.
 *
 * @param defaultOptions - Default options to use for all models created by this provider.
 *                         Must include a sandbox adapter. Runner is auto-created from modelId.
 * @returns SandAgent provider instance
 *
 * @example
 * ```typescript
 * import { createSandAgent } from '@sandagent/ai-provider';
 * import { E2BSandbox } from '@sandagent/sandbox-e2b';
 * import { generateText } from 'ai';
 *
 * // Runner is auto-created from modelId (claude models -> claude-agent-sdk)
 * const sandagent = createSandAgent({
 *   sandbox: new E2BSandbox({ apiKey: process.env.E2B_API_KEY! }),
 *   env: {
 *     ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
 *   },
 * });
 *
 * const { text } = await generateText({
 *   model: sandagent('sonnet'), // Auto-creates claude-agent-sdk runner
 *   prompt: 'Create a hello world program',
 * });
 * ```
 */
export function createSandAgent(
  defaultOptions: SandAgentProviderSettings,
): SandAgentProvider {
  const logger = getLogger(defaultOptions);

  // Validate that sandbox is provided
  if (!defaultOptions.sandbox) {
    throw new Error(
      "SandAgent provider requires a sandbox adapter. " +
        "Please provide one, e.g.: new E2BSandbox({ apiKey: 'xxx' })",
    );
  }

  const createModel = (
    modelId: SandAgentModelId,
    options: Partial<SandAgentProviderSettings> = {},
  ): LanguageModelV3 => {
    // Determine runner kind and model based on modelId
    const runnerKind = getRunnerKindForModel(modelId);
    const resolvedModelId = resolveModelId(modelId);

    // Build runner: kind and model are auto-determined from modelId
    // All runner options come from modelId, no default runner config needed
    const runner: RunnerSpec = {
      kind: runnerKind,
      model: resolvedModelId,
      // Use AI SDK UI Data Stream format for streaming responses
      outputFormat: "stream",
    };

    // Create merged options - runner is now a complete RunnerSpec
    // We need to add runner to the options for SandAgentLanguageModel
    const mergedOptions = {
      ...defaultOptions,
      ...options,
      runner, // runner is now a complete RunnerSpec with kind and model
      // Merge env vars, with options taking precedence
      env: {
        ...defaultOptions.env,
        ...options.env,
      },
    } as SandAgentProviderSettings & { runner: RunnerSpec };

    logger.debug(
      `[sandagent] Creating model: ${modelId} with runner: ${runner.kind}`,
    );

    return new SandAgentLanguageModel({
      id: modelId,
      options: mergedOptions,
    });
  };

  const provider = function (
    modelId: SandAgentModelId,
    options?: Partial<SandAgentProviderSettings>,
  ) {
    if (new.target) {
      throw new Error(
        "The SandAgent model function cannot be called with the new keyword.",
      );
    }

    return createModel(modelId, options);
  };

  provider.languageModel = createModel;
  provider.chat = createModel; // Alias for languageModel
  provider.specificationVersion = "v3" as const;

  // Add embeddingModel method that throws NoSuchModelError
  provider.embeddingModel = (modelId: string): EmbeddingModelV3 => {
    throw new NoSuchModelError({
      modelId,
      modelType: "embeddingModel",
    });
  };

  // Alias for embeddingModel
  provider.textEmbeddingModel = (modelId: string): EmbeddingModelV3 => {
    throw new NoSuchModelError({
      modelId,
      modelType: "embeddingModel",
    });
  };

  provider.imageModel = (modelId: string): ImageModelV3 => {
    throw new NoSuchModelError({
      modelId,
      modelType: "imageModel",
    });
  };

  return provider as SandAgentProvider;
}
