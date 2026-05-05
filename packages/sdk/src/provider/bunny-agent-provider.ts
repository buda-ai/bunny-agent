import type {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV3,
  ProviderV3,
} from "@ai-sdk/provider";
import { NoSuchModelError } from "@ai-sdk/provider";
import type { RunnerSpec } from "@bunny-agent/manager";
import { BunnyAgentLanguageModel } from "./bunny-agent-language-model";
import { getProviderLogger } from "./logging";
import type { BunnyAgentModelId, BunnyAgentProviderSettings } from "./types";

export type { BunnyAgentProviderSettings } from "./types";

/**
 * BunnyAgent provider interface that extends the AI SDK's ProviderV3.
 */
export interface BunnyAgentProvider extends ProviderV3 {
  (
    modelId: BunnyAgentModelId,
    options?: Partial<BunnyAgentProviderSettings>,
  ): LanguageModelV3;

  languageModel(
    modelId: BunnyAgentModelId,
    options?: Partial<BunnyAgentProviderSettings>,
  ): LanguageModelV3;

  chat(
    modelId: BunnyAgentModelId,
    options?: Partial<BunnyAgentProviderSettings>,
  ): LanguageModelV3;

  embeddingModel(modelId: string): EmbeddingModelV3;
  textEmbeddingModel(modelId: string): EmbeddingModelV3;
  imageModel(modelId: string): ImageModelV3;
}

/**
 * Creates a BunnyAgent provider instance with the specified configuration.
 *
 * @example
 * ```typescript
 * import { createBunnyAgent } from '@bunny-agent/sdk';
 * import { E2BSandbox } from '@bunny-agent/sandbox-e2b';
 * import { generateText } from 'ai';
 *
 * const bunnyAgent = createBunnyAgent({
 *   sandbox: new E2BSandbox({ apiKey: process.env.E2B_API_KEY! }),
 *   env: {
 *     ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
 *   },
 * });
 *
 * const { text } = await generateText({
 *   model: bunnyAgent('sonnet'),
 *   prompt: 'Create a hello world program',
 * });
 * ```
 */
export function createBunnyAgent(
  defaultOptions: BunnyAgentProviderSettings,
): BunnyAgentProvider {
  const logger = getProviderLogger(defaultOptions);

  if (!defaultOptions.sandbox) {
    throw new Error(
      "Provide a `sandbox` adapter (e.g. E2BSandbox, LocalSandbox). " +
        "Optional `daemonUrl` uses in-sandbox HTTP to bunny-agent-daemon (no automatic `/healthz` probe). Use `isBunnyAgentDaemonHealthy` from `@bunny-agent/sdk` if you want to probe and omit `daemonUrl` for CLI fallback. Omit `daemonUrl` to always use CLI.",
    );
  }

  const createModel = (
    modelId: BunnyAgentModelId,
    options: Partial<BunnyAgentProviderSettings> = {},
  ): LanguageModelV3 => {
    const mergedSkillPaths =
      options.skillPaths !== undefined
        ? options.skillPaths
        : defaultOptions.skillPaths;

    const mergedAllowedTools =
      options.allowedTools !== undefined
        ? options.allowedTools
        : defaultOptions.allowedTools;

    const runner: RunnerSpec = {
      model: modelId,
      runnerType: options.runnerType ?? defaultOptions.runnerType,
      outputFormat: "stream",
      maxTurns: options.maxTurns ?? defaultOptions.maxTurns,
      ...((options.systemPrompt ?? defaultOptions.systemPrompt)
        ? { systemPrompt: options.systemPrompt ?? defaultOptions.systemPrompt }
        : {}),
      ...(mergedSkillPaths && mergedSkillPaths.length > 0
        ? { skillPaths: mergedSkillPaths }
        : {}),
      ...(mergedAllowedTools !== undefined
        ? { allowedTools: mergedAllowedTools }
        : {}),
    };

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      runner,
      env: {
        ...defaultOptions.env,
        ...options.env,
      },
      artifactProcessors: [
        ...(defaultOptions.artifactProcessors ?? []),
        ...(options.artifactProcessors ?? []),
      ],
      toolRefs:
        options.toolRefs !== undefined
          ? options.toolRefs
          : defaultOptions.toolRefs,
    } as BunnyAgentProviderSettings & { runner: RunnerSpec };

    logger.debug(
      `[bunny-agent] Creating model: ${modelId}${runner.runnerType ? ` (runnerType: ${runner.runnerType})` : ""}${runner.skillPaths?.length ? ` skillPaths=${runner.skillPaths.length}` : ""}`,
    );

    return new BunnyAgentLanguageModel({
      id: modelId,
      options: mergedOptions,
    });
  };

  const provider = function (
    modelId: BunnyAgentModelId,
    options?: Partial<BunnyAgentProviderSettings>,
  ) {
    if (new.target) {
      throw new Error(
        "The BunnyAgent model function cannot be called with the new keyword.",
      );
    }

    return createModel(modelId, options);
  };

  provider.languageModel = createModel;
  provider.chat = createModel;
  provider.specificationVersion = "v3" as const;

  provider.embeddingModel = (modelId: string): EmbeddingModelV3 => {
    throw new NoSuchModelError({
      modelId,
      modelType: "embeddingModel",
    });
  };

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

  return provider as BunnyAgentProvider;
}
