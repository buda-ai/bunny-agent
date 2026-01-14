import type {
  LanguageModelV3,
  ProviderV3,
  EmbeddingModelV3,
  ImageModelV3,
} from "@ai-sdk/provider";
import { NoSuchModelError } from "@ai-sdk/provider";
import { SandAgentLanguageModel } from "./sandagent-language-model.js";
import type { SandAgentSettings, SandAgentModelId, Logger } from "./types.js";

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
   * @param settings - Optional additional settings to merge with defaults
   * @returns A language model instance
   */
  (
    modelId: SandAgentModelId,
    settings?: Partial<SandAgentSettings>
  ): LanguageModelV3;

  /**
   * Creates a language model instance for text generation.
   *
   * @param modelId - The Claude model to use
   * @param settings - Optional additional settings to merge with defaults
   * @returns A language model instance
   */
  languageModel(
    modelId: SandAgentModelId,
    settings?: Partial<SandAgentSettings>
  ): LanguageModelV3;

  /**
   * Alias for `languageModel()` to maintain compatibility with AI SDK patterns.
   *
   * @param modelId - The Claude model to use
   * @param settings - Optional additional settings to merge with defaults
   * @returns A language model instance
   */
  chat(
    modelId: SandAgentModelId,
    settings?: Partial<SandAgentSettings>
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
 * Configuration options for creating a SandAgent provider instance.
 * The sandbox is required; all other settings are optional defaults.
 *
 * @example
 * ```typescript
 * const provider = createSandAgent({
 *   sandbox: new E2BSandbox({ apiKey: 'xxx' }),
 *   env: {
 *     ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
 *   },
 *   template: 'coder',
 *   maxTurns: 10,
 * });
 * ```
 */
export interface SandAgentProviderSettings extends SandAgentSettings {
  // SandAgentSettings already contains all the settings we need
}

/**
 * Get a logger instance based on settings.
 */
function getLogger(settings: Partial<SandAgentSettings>): Logger {
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
 * @param defaultSettings - Default settings to use for all models created by this provider.
 *                          Must include a sandbox adapter.
 * @returns SandAgent provider instance
 *
 * @example
 * ```typescript
 * import { createSandAgent } from '@sandagent/ai-provider';
 * import { E2BSandbox } from '@sandagent/sandbox-e2b';
 * import { generateText } from 'ai';
 *
 * const sandagent = createSandAgent({
 *   sandbox: new E2BSandbox({ apiKey: process.env.E2B_API_KEY! }),
 *   env: {
 *     ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
 *   },
 * });
 *
 * const { text } = await generateText({
 *   model: sandagent('sonnet'),
 *   prompt: 'Create a hello world program',
 * });
 * ```
 */
export function createSandAgent(
  defaultSettings: SandAgentProviderSettings
): SandAgentProvider {
  const logger = getLogger(defaultSettings);

  // Validate that sandbox is provided
  if (!defaultSettings.sandbox) {
    throw new Error(
      "SandAgent provider requires a sandbox adapter. " +
        "Please provide one, e.g.: new E2BSandbox({ apiKey: 'xxx' })"
    );
  }

  const createModel = (
    modelId: SandAgentModelId,
    settings: Partial<SandAgentSettings> = {}
  ): LanguageModelV3 => {
    // Merge settings with defaults
    const mergedSettings: SandAgentSettings = {
      ...defaultSettings,
      ...settings,
      // Merge env vars, with settings taking precedence
      env: {
        ...defaultSettings.env,
        ...settings.env,
      },
    };

    logger.debug(
      `[sandagent] Creating model: ${modelId} with template: ${mergedSettings.template ?? "default"}`
    );

    return new SandAgentLanguageModel({
      id: modelId,
      settings: mergedSettings,
    });
  };

  const provider = function (
    modelId: SandAgentModelId,
    settings?: Partial<SandAgentSettings>
  ) {
    if (new.target) {
      throw new Error(
        "The SandAgent model function cannot be called with the new keyword."
      );
    }

    return createModel(modelId, settings);
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
