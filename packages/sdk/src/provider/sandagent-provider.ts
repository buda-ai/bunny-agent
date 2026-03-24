import type {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV3,
  ProviderV3,
} from "@ai-sdk/provider";
import { NoSuchModelError } from "@ai-sdk/provider";
import type { RunnerSpec } from "@sandagent/manager";
import { getProviderLogger } from "./logging";
import { SandAgentLanguageModel } from "./sandagent-language-model";
import type { SandAgentModelId } from "./types";
import { getRunnerKindForModel, type SandAgentProviderSettings } from "./types";

export type { SandAgentProviderSettings } from "./types";

/**
 * SandAgent provider interface that extends the AI SDK's ProviderV3.
 */
export interface SandAgentProvider extends ProviderV3 {
  (
    modelId: SandAgentModelId,
    options?: Partial<SandAgentProviderSettings>,
  ): LanguageModelV3;

  languageModel(
    modelId: SandAgentModelId,
    options?: Partial<SandAgentProviderSettings>,
  ): LanguageModelV3;

  chat(
    modelId: SandAgentModelId,
    options?: Partial<SandAgentProviderSettings>,
  ): LanguageModelV3;

  embeddingModel(modelId: string): EmbeddingModelV3;
  textEmbeddingModel(modelId: string): EmbeddingModelV3;
  imageModel(modelId: string): ImageModelV3;
}

/**
 * Creates a SandAgent provider instance with the specified configuration.
 *
 * @example
 * ```typescript
 * import { createSandAgent } from '@sandagent/sdk';
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
  defaultOptions: SandAgentProviderSettings,
): SandAgentProvider {
  const logger = getProviderLogger(defaultOptions);

  if (!defaultOptions.sandbox) {
    throw new Error(
      "Provide a `sandbox` adapter (e.g. E2BSandbox, LocalSandbox). " +
        "Optional `daemonUrl` selects in-sandbox HTTP to sandagent-daemon (e.g. `http://127.0.0.1:3080`); omit it to use the CLI runner in the sandbox.",
    );
  }

  const createModel = (
    modelId: SandAgentModelId,
    options: Partial<SandAgentProviderSettings> = {},
  ): LanguageModelV3 => {
    const runnerKind = getRunnerKindForModel(modelId);

    const mergedSkillPaths =
      options.skillPaths !== undefined
        ? options.skillPaths
        : defaultOptions.skillPaths;

    const mergedAllowedTools =
      options.allowedTools !== undefined
        ? options.allowedTools
        : defaultOptions.allowedTools;

    const runner: RunnerSpec = {
      kind: runnerKind,
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
    } as SandAgentProviderSettings & { runner: RunnerSpec };

    logger.debug(
      `[sandagent] Creating model: ${modelId} with runner: ${runner.kind}${runner.runnerType ? ` (runnerType: ${runner.runnerType})` : ""}${runner.skillPaths?.length ? ` skillPaths=${runner.skillPaths.length}` : ""}`,
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

  return provider as SandAgentProvider;
}
