import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getModel, type Usage } from "@mariozechner/pi-ai";
import {
  type AgentSessionEvent,
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { BunnyAgentResourceLoader } from "./bunny-agent-resource-loader.js";
import {
  buildImageEditTool,
  buildImageGenerateTool,
  type ImageToolDetails,
} from "./image-tools.js";
import { buildSecretAwareTools, redactSecrets } from "./tool-overrides.js";

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
  // biome-ignore lint/suspicious/noExplicitAny: pi-ai model type is generic and extensible.
  model: any,
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

function emitStreamError(errorText: string): string[] {
  return [
    `data: ${JSON.stringify({ type: "error", errorText })}\n\n`,
    `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n`,
    "data: [DONE]\n\n",
  ];
}

/**
 * Extract plain text from pi's ToolResult format.
 *
 * Pi tools return results in the shape:
 *   { content: [{ type: "text", text: "..." }, ...], details: { ... } }
 *
 * When this object is serialised as-is into the `tool-output-available` SSE
 * event and the UI renders it, users see raw JSON like
 *   {"content":[{"type":"text","text":"Command timed out after 10 seconds"}],"details":{}}
 * instead of a readable message.
 *
 * This function unwraps the content array and joins all text parts so the
 * downstream SDK and UI always receive a plain string.
 */
export function extractToolResultText(result: unknown): string {
  if (result !== null && typeof result === "object") {
    const r = result as {
      content?: Array<{ type?: string; text?: string }>;
    };
    if (Array.isArray(r.content) && r.content.length > 0) {
      const text = r.content
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n");
      if (text.length > 0) {
        return text;
      }
    }
  }
  // Fallback: stringify whatever we received so the caller always gets a string.
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

/**
 * Map pi-ai Usage to the shape expected by the SDK (messageMetadata.usage).
 * SDK convertUsage accepts input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens.
 */
function usageToMessageMetadata(usage: Usage): Record<string, number> {
  return {
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_read_input_tokens: usage.cacheRead,
    cache_creation_input_tokens: usage.cacheWrite,
  };
}

/**
 * Get usage from the last assistant message in agent_end.messages.
 */
function getUsageFromAgentEndMessages(
  messages: Array<{ role: string; usage?: Usage }>,
): Usage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.usage != null) {
      return m.usage;
    }
  }
  return undefined;
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
  // biome-ignore lint/suspicious/noExplicitAny: model type is complex
  let model = (defaultModel ?? modelRegistry.find(provider, modelName)) as any;
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
              return SessionManager.open(resume);
            }
            const sessions = await SessionManager.list(cwd);
            const found = sessions.find((s) => s.id === resume);
            return found
              ? SessionManager.open(found.path)
              : SessionManager.create(cwd);
          }
          // Always start a fresh session when no explicit resume is requested.
          // Using continueRecent() would load stale session data from previous
          // runs, which can confuse the LLM context and cause errors such as
          // "Model tried to call unavailable tool 'bash'. No tools are available."
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

          let promptText = userInput;
          let images:
            | Array<{ type: "image"; data: string; mimeType: string }>
            | undefined;

          // Try to parse userInput as a JSON array of parts (if passed from bunny-agent SDK)
          try {
            if (userInput.startsWith("[") && userInput.endsWith("]")) {
              const parsed = JSON.parse(userInput);
              if (Array.isArray(parsed)) {
                promptText = parsed
                  .filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("\n");

                const imageParts = parsed.filter((p) => p.type === "image");
                if (imageParts.length > 0) {
                  images = imageParts.map((p) => ({
                    type: "image",
                    data: p.data,
                    mimeType: p.mimeType,
                  }));
                }
              }
            }
          } catch (_e) {
            // Fallback to raw string if parsing fails
          }

          const promptPromise = session.prompt(
            promptText,
            images ? { images } : undefined,
          );

          const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          let hasStarted = false;
          let hasFinished = false;

          /** Accumulated token usage from image tool calls (details.response.usage). */
          const imageToolUsage = { input_tokens: 0, output_tokens: 0 };

          /** Fresh id for each assistant text segment so the UI keeps tool/text order as separate parts. */
          const newTextPartId = () =>
            `text_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;

          let activeTextPartId: string | null = null;
          let textStreamOpen = false;

          const endTextStreamIfOpen = function* (): Generator<
            string,
            void,
            unknown
          > {
            if (textStreamOpen && activeTextPartId != null) {
              yield `data: ${JSON.stringify({ type: "text-end", id: activeTextPartId })}\n\n`;
              textStreamOpen = false;
              activeTextPartId = null;
            }
          };

          const beginTextStream = function* (): Generator<
            string,
            void,
            unknown
          > {
            activeTextPartId = newTextPartId();
            yield `data: ${JSON.stringify({ type: "text-start", id: activeTextPartId })}\n\n`;
            textStreamOpen = true;
          };

          const ensureStartEvent = async function* () {
            if (!hasStarted) {
              yield `data: ${JSON.stringify({ type: "start", messageId })}\n\n`;
              yield `data: ${JSON.stringify({
                type: "message-metadata",
                messageMetadata: { sessionId: session.sessionId },
              })}\n\n`;
              hasStarted = true;
            }
          };

          const finishSuccess = async function* (usage?: Usage) {
            yield* endTextStreamIfOpen();
            const finishPayload: {
              type: "finish";
              finishReason: string;
              messageMetadata?: { usage: Record<string, number> };
            } = { type: "finish", finishReason: "stop" };
            const hasImageUsage =
              imageToolUsage.input_tokens > 0 ||
              imageToolUsage.output_tokens > 0;
            if (usage != null || hasImageUsage) {
              const base = usage != null ? usageToMessageMetadata(usage) : {};
              finishPayload.messageMetadata = {
                usage: {
                  ...base,
                  input_tokens:
                    (base.input_tokens ?? 0) + imageToolUsage.input_tokens,
                  output_tokens:
                    (base.output_tokens ?? 0) + imageToolUsage.output_tokens,
                },
              };
            }
            yield `data: ${JSON.stringify(finishPayload)}\n\n`;
            yield "data: [DONE]\n\n";
            hasFinished = true;
          };

          const finishError = async function* (errorText: string) {
            for (const chunk of emitStreamError(errorText)) {
              yield chunk;
            }
            hasFinished = true;
          };

          while (!isComplete || eventQueue.length > 0) {
            while (eventQueue.length > 0) {
              const event = eventQueue.shift()!;
              traceRawMessage(cwd, event, false, options.env);

              yield* ensureStartEvent();

              if (event.type === "message_start") {
                const msg = (
                  event as {
                    message?: { role?: string };
                  }
                ).message;
                if (msg?.role === "assistant") {
                  yield* endTextStreamIfOpen();
                }
              } else if (event.type === "message_update") {
                const sub = event.assistantMessageEvent as {
                  type: string;
                  delta?: string;
                };
                if (sub.type === "text_start") {
                  yield* endTextStreamIfOpen();
                  yield* beginTextStream();
                } else if (sub.type === "text_delta") {
                  let delta = sub.delta;
                  if (delta) {
                    if (options.env && Object.keys(options.env).length > 0) {
                      delta = redactSecrets(delta, options.env);
                    }
                    if (!textStreamOpen) {
                      yield* beginTextStream();
                    }
                    yield `data: ${JSON.stringify({
                      type: "text-delta",
                      id: activeTextPartId,
                      delta,
                    })}\n\n`;
                  }
                } else if (sub.type === "toolcall_start") {
                  yield* endTextStreamIfOpen();
                }
              } else if (event.type === "tool_execution_start") {
                yield* endTextStreamIfOpen();
                yield `data: ${JSON.stringify({ type: "tool-input-start", toolCallId: event.toolCallId, toolName: event.toolName, dynamic: true, providerExecuted: true })}\n\n`;
                yield `data: ${JSON.stringify({ type: "tool-input-available", toolCallId: event.toolCallId, toolName: event.toolName, input: event.args, dynamic: true, providerExecuted: true })}\n\n`;
              } else if (event.type === "tool_execution_end") {
                let output = extractToolResultText(event.result);
                if (options.env && Object.keys(options.env).length > 0) {
                  output = redactSecrets(output, options.env);
                }
                // Collect token usage from image tool results (details.response.usage)
                if (
                  (event.toolName === "generate_image" ||
                    event.toolName === "edit_image") &&
                  event.result !== null &&
                  typeof event.result === "object"
                ) {
                  const details = (
                    event.result as { details?: ImageToolDetails }
                  ).details;
                  const u = details?.response?.usage;
                  if (u) {
                    imageToolUsage.input_tokens += u.input_tokens ?? 0;
                    imageToolUsage.output_tokens += u.output_tokens ?? 0;
                  }
                }
                yield `data: ${JSON.stringify({ type: "tool-output-available", toolCallId: event.toolCallId, output, isError: event.isError, dynamic: true, providerExecuted: true })}\n\n`;
              } else if (event.type === "agent_end") {
                if (aborted) {
                  yield* finishError("Run aborted by signal.");
                } else {
                  const errorMsg = getErrorFromAgentEndMessages(event.messages);
                  if (errorMsg) {
                    yield* finishError(errorMsg);
                  } else {
                    const usage = getUsageFromAgentEndMessages(event.messages);
                    yield* finishSuccess(usage);
                  }
                }
              }
            }

            if (aborted && !hasFinished) {
              yield* ensureStartEvent();
              yield* finishError("Run aborted by signal.");
              break;
            }

            if (!isComplete && eventQueue.length === 0) {
              await new Promise<void>((resolve) => {
                wakeConsumer = resolve;
              });
            }
          }

          if (hasFinished) {
            return;
          }

          try {
            await promptPromise;
          } catch (error) {
            if (!hasFinished) {
              yield* ensureStartEvent();
              const message =
                error instanceof Error ? error.message : "Pi agent run failed.";
              yield* finishError(message);
            }
            return;
          }

          if (!hasFinished && session.agent.state.error) {
            yield* ensureStartEvent();
            yield* finishError(session.agent.state.error);
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
