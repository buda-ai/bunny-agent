import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { type Api, getModel, type Model } from "@mariozechner/pi-ai";
import {
  type AgentSessionEvent,
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { BunnyAgentResourceLoader } from "./bunny-agent-resource-loader.js";
import { buildImageEditTool, buildImageGenerateTool } from "./image-tools.js";
import { buildVideoGenerateTool } from "./video-tools.js";
import {
  extractSessionContext,
  isSessionFileTooLarge,
  resolveSessionPathById,
} from "./session-utils.js";
import {
  extractToolResultText,
  PiAISDKStreamConverter,
} from "./stream-converter.js";
import { buildSecretAwareTools, redactSecrets } from "./tool-overrides.js";
import { buildToolDefinitionsFromRefs, type PiToolRef } from "./tool-refs.js";
import { getUsageFromAgentEndMessages } from "./usage-metadata.js";

const LOG_PREFIX = "[bunny-agent:pi]";

export interface PiRunnerOptions {
  model?: string;
  systemPrompt?: string;
  cwd?: string;
  /**
   * Runner configuration (API keys, base URLs, etc.). Read via {@link getEnvValue} and
   * auth helpers; values are injected into bash spawn context only.
   */
  env?: Record<string, string>;
  abortController?: AbortController;
  /**
   * Session ID to resume (from previous run's message-metadata.sessionId).
   * When set, the runner resolves it to a session file via SessionManager.list(cwd) and opens it;
   * if the value contains '/', it is treated as a session file path and opened directly.
   * When NOT set, a brand-new session is created each time so no stale context
   * is loaded from previous runs.
   * Sessions use Pi's default directory (~/.pi/agent/sessions/...) so workspace is not used.
   */
  sessionId?: string;
  /** Additional skill paths (files or directories) */
  skillPaths?: string[];
  yolo?: boolean;
  /**
   * Custom tools to register alongside built-in pi tools and the runner's
   * secret-aware bash/read overrides. This is the pi-native escape hatch for
   * callers that already have ToolDefinition objects.
   *
   * Definitions are appended after the built-ins so they cannot accidentally
   * override `bash` / `read`; they participate in pi's normal tool-call flow.
   */
  customTools?: ToolDefinition[];
  /**
   * Serializable Bunny tool refs. Pi owns the conversion into pi-native
   * ToolDefinition objects so the shared runner harness stays runner-agnostic.
   */
  toolRefs?: PiToolRef[];
}

export interface PiRunner {
  run(userInput: string): AsyncIterable<string>;
}

export function parseModelSpec(model: string): {
  provider: string;
  modelName: string;
} {
  const trimmed = model.trim();
  const separator = trimmed.indexOf(":");

  if (separator <= 0 || separator === trimmed.length - 1) {
    throw new Error(
      `Invalid pi model "${model}". Expected format "<provider>:<model>", for example "google:gemini-2.5-pro".`,
    );
  }

  return {
    provider: trimmed.slice(0, separator),
    modelName: trimmed.slice(separator + 1),
  };
}

/**
 * Resolve the image model name from IMAGE_GENERATION_MODEL env var.
 * Only returns a model name if the image provider matches the chat provider.
 * Returns undefined if not set or provider mismatch.
 */
export function resolveImageModelName(
  chatProvider: string,
  env: Record<string, string> | undefined,
): string | undefined {
  const spec = env?.IMAGE_GENERATION_MODEL;
  if (!spec) return undefined;
  try {
    const { provider, modelName } = parseModelSpec(spec);
    return provider === chatProvider ? modelName : undefined;
  } catch {
    return undefined;
  }
}

function getEnvValue(
  optionsEnv: Record<string, string> | undefined,
  name: string,
): string | undefined {
  return optionsEnv?.[name] ?? process.env[name];
}

function applyModelOverrides(
  model: { baseUrl?: string } | null | undefined,
  provider: string,
  optionsEnv?: Record<string, string>,
): void {
  if (model == null) return;

  const openAiBaseUrl = getEnvValue(optionsEnv, "OPENAI_BASE_URL");
  const geminiBaseUrl = getEnvValue(optionsEnv, "GEMINI_BASE_URL");
  const anthropicBaseUrl = getEnvValue(optionsEnv, "ANTHROPIC_BASE_URL");

  if (provider === "openai" && openAiBaseUrl) {
    model.baseUrl = openAiBaseUrl;
  } else if (provider === "google" && geminiBaseUrl) {
    model.baseUrl = geminiBaseUrl;
  } else if (provider === "anthropic" && anthropicBaseUrl) {
    model.baseUrl = anthropicBaseUrl;
  }
}

/**
 * Extract error message from agent_end messages (e.g. 401 auth errors, model errors).
 * Pi agent sets stopReason:"error" and errorMessage on the assistant message.
 */
function getErrorFromAgentEndMessages(
  messages: Array<{
    role: string;
    stopReason?: string;
    errorMessage?: string;
  }>,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.errorMessage) {
      return m.errorMessage;
    }
  }
  return undefined;
}

/**
 * Debug trace: append raw Pi agent events to a JSON-lines file when DEBUG=true.
 * Same idea as runner-claude's claude-message-stream-debug.json.
 */
function traceRawMessage(
  debugCwd: string,
  data: unknown,
  reset = false,
  optionsEnv?: Record<string, string>,
): void {
  const debugVal = getEnvValue(optionsEnv, "DEBUG");
  const enabled = debugVal === "true" || debugVal === "1";
  if (!enabled) return;
  try {
    const file = join(debugCwd, "pi-message-stream-debug.json");
    if (reset && existsSync(file)) unlinkSync(file);
    const type =
      data !== null && typeof data === "object"
        ? (data as { type?: string }).type
        : undefined;
    let payload: unknown = data;
    try {
      payload =
        data !== undefined ? JSON.parse(JSON.stringify(data)) : undefined;
    } catch {
      payload = "[non-serializable]";
    }
    const entry = { _t: new Date().toISOString(), type, payload };
    appendFileSync(file, JSON.stringify(entry, null, 2) + ",\n");
  } catch {
    // ignore
  }
}

/**
 * Create a Pi agent runner that outputs SSE format (Data Stream Protocol).
 * Uses pi-coding-agent's AgentSession + SessionManager with default session dir (~/.pi).
 * Resume: pass previous run's message-metadata.sessionFile as options.sessionId (--resume).
 */
export function createPiRunner(options: PiRunnerOptions = {}): PiRunner {
  const modelSpec = options.model;
  if (modelSpec == null || modelSpec.trim() === "") {
    throw new Error(
      "Pi runner: model is required. Pass a model in the form <provider>:<model>, e.g. openai:gpt-4o or google:gemini-2.5-flash.",
    );
  }
  const { provider, modelName } = parseModelSpec(modelSpec.trim());
  const cwd = options.cwd || process.cwd();
  const apiKeyEnvKey = `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  /** Raw key from caller env map (e.g. daemon body); avoids relying on `process.env` for that provider. */
  const inlineApiKey =
    typeof options.env?.[apiKeyEnvKey] === "string" &&
    options.env[apiKeyEnvKey].length > 0
      ? options.env[apiKeyEnvKey]
      : undefined;

  // Build a ModelRegistry, auto-registering unknown models using env-based config
  const modelRegistry = ModelRegistry.inMemory(AuthStorage.create());
  // biome-ignore lint/suspicious/noExplicitAny: getModel accepts provider string unions.
  const defaultModel = getModel(provider as any, modelName);
  let model = (defaultModel ??
    modelRegistry.find(provider, modelName)) as Model<Api>;
  if (model == null) {
    // Auto-register: use <PROVIDER>_BASE_URL or fallback to OPENAI_BASE_URL
    const baseUrlEnvKey = `${provider.toUpperCase().replace(/-/g, "_")}_BASE_URL`;
    const baseUrl =
      getEnvValue(options.env, baseUrlEnvKey) ??
      getEnvValue(options.env, "OPENAI_BASE_URL");
    if (!baseUrl) {
      throw new Error(
        `Pi runner: model "${modelSpec}" not found in built-in catalog. ` +
          `Set ${baseUrlEnvKey} (or OPENAI_BASE_URL) to auto-register it.`,
      );
    }
    // Pi resolves `apiKey` via resolveConfigValue: env var name → process.env, else literal.
    modelRegistry.registerProvider(provider, {
      baseUrl,
      apiKey: inlineApiKey ?? apiKeyEnvKey,
      api: "openai-completions",
      models: [
        {
          id: modelName,
          name: modelName,
          reasoning: false,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 8192,
        },
      ],
    });
    const registered = modelRegistry.find(provider, modelName);
    if (!registered) {
      throw new Error(
        `Pi runner: failed to resolve model "${modelSpec}" after registration.`,
      );
    }
    model = registered;
  }
  applyModelOverrides(model, provider, options.env);

  // Unified image model for both generate_image and edit_image.
  const imageModelName = resolveImageModelName(provider, options.env);

  return {
    async *run(userInput: string): AsyncIterable<string> {
      if (inlineApiKey !== undefined) {
        modelRegistry.authStorage.setRuntimeApiKey(provider, inlineApiKey);
      }
      try {
        const resume = options.sessionId?.trim();
        const sessionManager = await (async (): Promise<
          ReturnType<typeof SessionManager.create>
        > => {
          if (resume !== undefined && resume !== "") {
            if (resume.includes("/")) {
              // Full path provided — open directly
              return SessionManager.open(resume);
            }
            // Find session file by id without parsing contents (OOM fix)
            const sessionPath = resolveSessionPathById(cwd, resume);
            console.error(
              `${LOG_PREFIX} resume: id=${resume} path=${sessionPath ?? "(not found)"}`,
            );
            if (sessionPath) {
              // Skip loading oversized session files to avoid OOM.
              // Extract the last compaction summary so the new session
              // retains context from the previous conversation.
              if (isSessionFileTooLarge(sessionPath)) {
                const context = extractSessionContext(sessionPath);
                console.error(
                  `${LOG_PREFIX} session file too large, starting fresh${context ? " (with context)" : ""}`,
                );
                const newMgr = SessionManager.create(cwd);
                if (context) {
                  const firstId = newMgr.getEntries()[0]?.id ?? "";
                  newMgr.appendCompaction(context, firstId, 0);
                }
                return newMgr;
              }
              return SessionManager.open(sessionPath);
            }
            return SessionManager.create(cwd);
          }
          return SessionManager.create(cwd);
        })();

        const resourceLoader = options.skillPaths
          ? new BunnyAgentResourceLoader({
              cwd,
              skillPaths: options.skillPaths,
              appendSystemPrompt: options.systemPrompt,
            })
          : undefined;

        if (options.skillPaths && options.skillPaths.length > 0) {
          console.error(
            `${LOG_PREFIX} runner: cwd=${cwd} skillPaths=${JSON.stringify(options.skillPaths)}`,
          );
        }

        // createAgentSession only calls reload() when it creates its own
        // DefaultResourceLoader.  When we supply our own BunnyAgentResourceLoader
        // we must reload it ourselves so that skills and extensions on disk are
        // picked up before the session is built.
        if (resourceLoader) {
          await resourceLoader.reload();
        }

        const customTools: ToolDefinition[] =
          options.env && Object.keys(options.env).length > 0
            ? buildSecretAwareTools(cwd, options.env)
            : [];

        if (imageModelName) {
          const apiKey =
            (await modelRegistry.authStorage.getApiKey(provider)) ?? "";
          customTools.push(
            buildImageGenerateTool(cwd, imageModelName, model.baseUrl, apiKey),
            buildImageEditTool(cwd, imageModelName, model.baseUrl, apiKey),
          );
        }

        // Register Video Generation Tool via auto-detected Provider
        const videoTool = buildVideoGenerateTool(options.env);
        if (videoTool) {
          customTools.push(videoTool);
        }

        if (options.customTools && options.customTools.length > 0) {
          customTools.push(...options.customTools);
        }

        if (options.toolRefs && options.toolRefs.length > 0) {
          customTools.push(...buildToolDefinitionsFromRefs(options.toolRefs));
        }

        const { session } = await createAgentSession({
          cwd,
          model,
          sessionManager,
          modelRegistry,
          resourceLoader,
          customTools,
        });

        const eventQueue: AgentSessionEvent[] = [];
        let isComplete = false;
        let aborted = false;
        let wakeConsumer: (() => void) | null = null;

        const notify = () => {
          wakeConsumer?.();
          wakeConsumer = null;
        };

        const unsubscribe = session.subscribe((e) => {
          eventQueue.push(e);
          if (e.type === "agent_end") {
            isComplete = true;
          }
          notify();
        });

        const abortSignal = options.abortController?.signal;
        const abortHandler = () => {
          aborted = true;
          isComplete = true;
          void session.abort();
          notify();
        };

        if (abortSignal) {
          abortSignal.addEventListener("abort", abortHandler);
          if (abortSignal.aborted) {
            abortHandler();
          }
        }

        try {
          traceRawMessage(cwd, null, true, options.env);

          const promptText = userInput;
          const promptPromise = session.prompt(promptText);

          const streamConverter = new PiAISDKStreamConverter({
            sessionId: session.sessionId,
            model,
            redactText: (value: string) => {
              if (options.env && Object.keys(options.env).length > 0) {
                return redactSecrets(value, options.env);
              }
              return value;
            },
            normalizeToolOutput: extractToolResultText,
            getUsageFromAgentEndMessages,
            getErrorFromAgentEndMessages,
          });

          while (!isComplete || eventQueue.length > 0) {
            while (eventQueue.length > 0) {
              const event = eventQueue.shift()!;
              traceRawMessage(cwd, event, false, options.env);
              const chunks = streamConverter.handleEvent(event, aborted);
              for (const chunk of chunks) {
                yield chunk;
              }
            }

            if (aborted && !streamConverter.finished) {
              for (const chunk of streamConverter.forceError(
                "Run aborted by signal.",
              )) {
                yield chunk;
              }
              break;
            }

            if (!isComplete && eventQueue.length === 0) {
              await new Promise<void>((resolve) => {
                wakeConsumer = resolve;
              });
            }
          }

          if (streamConverter.finished) {
            return;
          }

          try {
            await promptPromise;
          } catch (error) {
            if (!streamConverter.finished) {
              const message =
                error instanceof Error ? error.message : "Pi agent run failed.";
              for (const chunk of streamConverter.forceError(message)) {
                yield chunk;
              }
            }
            return;
          }

          if (!streamConverter.finished && session.agent.state.error) {
            for (const chunk of streamConverter.forceError(
              session.agent.state.error,
            )) {
              yield chunk;
            }
          }
        } finally {
          if (abortSignal) {
            abortSignal.removeEventListener("abort", abortHandler);
          }
          unsubscribe();
          session.dispose();
        }
      } finally {
        if (inlineApiKey !== undefined) {
          modelRegistry.authStorage.removeRuntimeApiKey(provider);
        }
      }
    },
  };
}
