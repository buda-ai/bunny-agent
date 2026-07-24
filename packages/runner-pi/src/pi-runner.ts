import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import {
  type AgentSessionEvent,
  createAgentSession,
  ModelRuntime,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { ensureApplyPatchShim } from "./apply-patch-shim.js";
import { buildApplyPatchTool } from "./apply-patch-tool.js";
import { BunnyAgentResourceLoader } from "./bunny-agent-resource-loader.js";
import { buildImageEditTool, buildImageGenerateTool } from "./image-tools.js";
import { installPiSessionToolHistoryRepair } from "./session-history-repair.js";
import {
  extractSessionContext,
  isSessionFileTooLarge,
  resolveSessionPathById,
} from "./session-utils.js";
import {
  extractToolResultText,
  PiAISDKStreamConverter,
} from "./stream-converter.js";
import {
  buildEnvInjectedBashTool,
  buildSecretAwareTools,
} from "./tool-overrides.js";
import { buildToolDefinitionsFromRefs, type PiToolRef } from "./tool-refs.js";
import { getUsageFromAgentEndMessages } from "./usage-metadata.js";

const LOG_PREFIX = "[bunny-agent:pi]";
const LLM_THOUGHT_SIGNATURE_SEPARATOR = "__thought__";

export interface PiRunnerOptions {
  model?: string;
  systemPrompt?: string;
  cwd?: string;
  /**
   * Runner configuration (API keys, base URLs, etc.). Read via {@link getEnvValue} and
   * auth helpers; values are injected into bash spawn context only.
   */
  env?: Record<string, string>;
  /**
   * Optional caller-declared subset of `env` whose keys are safe to forward
   * to the bash tool's child process. When omitted, the runner classifies
   * `env` via the manager's whitelist so business credentials never leak
   * into the shell. Use this to opt specific business keys into bash when a
   * task genuinely needs them.
   */
  systemEnv?: Record<string, string>;
  abortController?: AbortController;
  /**
   * Session ID to resume (from previous run's message-metadata.sessionId).
   * When set, the runner resolves it to a session file via SessionManager.list(cwd) and opens it;
   * if the value contains '/', it is treated as a session file path and opened directly.
   * When NOT set, a brand-new session is created each time so no stale context
   * is loaded from previous runs.
   * Sessions use Bunny's patched pi config directory (~/.bunny/agent/sessions/...) so workspace is not used.
   */
  sessionId?: string;
  /** Full transcript used only when `sessionId` cannot be resolved. */
  resumeFallbackUserInput?: string;
  /**
   * Source session ID to fork from. When set, the runner locates the source
   * session file, snapshot-clones it via SessionManager.forkFrom into a brand
   * new session (with a fresh id and header pointing at the source as
   * parentSession), and runs the current turn on top of that copied history.
   *
   * Mutually exclusive with `sessionId`. If both are set, `forkFrom` wins and
   * `sessionId` is ignored (the fork produces the new session id, which is
   * emitted back to the caller via message-metadata for subsequent resumes).
   *
   * The source may be either a raw pi session id or a full session file path
   * (contains '/'), mirroring how `sessionId` accepts both.
   */
  forkFrom?: string;
  /** Additional skill paths (files or directories) */
  skillPaths?: string[];
  /**
   * Explicit allowlist for tools. Undefined means expose the runner defaults.
   * When provided, it filters built-in tools, custom tools, and toolRefs so
   * resumed pi sessions cannot keep using tools the caller has disabled.
   */
  allowedTools?: string[];
  yolo?: boolean;
  /**
   * Serializable Bunny tool refs. Pi owns the conversion into pi-native
   * ToolDefinition objects so the shared runner harness stays runner-agnostic.
   */
  toolRefs?: PiToolRef[];
  /**
   * Reasoning effort / thinking level for the model (e.g. "low", "medium", "high").
   * Mapped to pi-mono's ThinkingLevel and passed to createAgentSession.
   */
  effort?: string;
}

export interface PiRunner {
  run(userInput: string): AsyncIterable<string>;
}

function applyAllowedTools(
  tools: ToolDefinition[],
  allowedTools: string[] | undefined,
): ToolDefinition[] {
  if (!allowedTools) return tools;
  const allowed = new Set(allowedTools);
  return tools.filter((tool) => allowed.has(tool.name));
}

export function shouldStripLLMThoughtSignaturesForModel(model: {
  id?: string;
}): boolean {
  const id = (model.id ?? "").toLowerCase();
  return !id.includes("gemini");
}

export function stripLLMThoughtSignatureFromId(id: string): string {
  const separatorIndex = id.indexOf(LLM_THOUGHT_SIGNATURE_SEPARATOR);
  if (separatorIndex === -1) return id;
  return id.slice(0, separatorIndex);
}

export function stripLLMThoughtSignaturesFromSessionManager(
  sessionManager: unknown,
  model: { id?: string },
): void {
  if (!shouldStripLLMThoughtSignaturesForModel(model)) return;

  const manager = sessionManager as {
    getEntries?: () => unknown[];
    buildSessionContext?: () => { messages?: unknown[] };
  };
  const entries = manager.getEntries?.();
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (entry == null || typeof entry !== "object") continue;
      const message = (entry as { type?: string; message?: unknown }).message;
      if ((entry as { type?: string }).type === "message") {
        stripLLMThoughtSignaturesFromMessage(message);
      }
    }
    return;
  }

  const context = (
    sessionManager as {
      buildSessionContext?: () => { messages?: unknown[] };
    }
  ).buildSessionContext?.();
  const messages = context?.messages;
  if (!Array.isArray(messages)) return;

  for (const message of messages) {
    stripLLMThoughtSignaturesFromMessage(message);
  }
}

function stripLLMThoughtSignaturesFromMessage(message: unknown): void {
  if (message == null || typeof message !== "object") return;
  const msg = message as {
    role?: string;
    toolCallId?: string;
    tool_call_id?: string;
    content?: unknown;
  };

  if (typeof msg.toolCallId === "string") {
    msg.toolCallId = stripLLMThoughtSignatureFromId(msg.toolCallId);
  }
  if (typeof msg.tool_call_id === "string") {
    msg.tool_call_id = stripLLMThoughtSignatureFromId(msg.tool_call_id);
  }

  if (!Array.isArray(msg.content)) return;
  for (const block of msg.content) {
    if (block == null || typeof block !== "object") continue;
    const contentBlock = block as {
      type?: string;
      id?: string;
      toolCallId?: string;
      tool_call_id?: string;
      call_id?: string;
    };
    if (contentBlock.type !== "toolCall") continue;
    if (typeof contentBlock.id === "string") {
      contentBlock.id = stripLLMThoughtSignatureFromId(contentBlock.id);
    }
    if (typeof contentBlock.toolCallId === "string") {
      contentBlock.toolCallId = stripLLMThoughtSignatureFromId(
        contentBlock.toolCallId,
      );
    }
    if (typeof contentBlock.tool_call_id === "string") {
      contentBlock.tool_call_id = stripLLMThoughtSignatureFromId(
        contentBlock.tool_call_id,
      );
    }
    if (typeof contentBlock.call_id === "string") {
      contentBlock.call_id = stripLLMThoughtSignatureFromId(
        contentBlock.call_id,
      );
    }
  }
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
 * Uses pi-coding-agent's AgentSession + SessionManager with Bunny's patched
 * default session dir (~/.bunny/agent/sessions/...).
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

  // Unified image model for both generate_image and edit_image.
  const imageModelName = resolveImageModelName(provider, options.env);

  return {
    async *run(userInput: string): AsyncIterable<string> {
      const modelRuntime = await ModelRuntime.create({
        modelsPath: null,
        allowModelNetwork: false,
      });
      if (inlineApiKey !== undefined) {
        await modelRuntime.setRuntimeApiKey(provider, inlineApiKey);
      }
      try {
        // biome-ignore lint/suspicious/noExplicitAny: getBuiltinModel accepts provider/model string unions.
        const defaultModel = getBuiltinModel(provider as any, modelName as any);
        let model = (defaultModel ??
          modelRuntime.getModel(provider, modelName)) as Model<Api>;
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
          // Pi resolves `apiKey` via resolveConfigValue: env var name -> process.env, else literal.
          modelRuntime.registerProvider(provider, {
            baseUrl,
            apiKey: inlineApiKey ?? apiKeyEnvKey,
            api: "openai-completions",
            models: [
              {
                id: modelName,
                name: modelName,
                reasoning: !!options.effort && options.effort !== "off",
                thinkingLevelMap: { off: null, xhigh: "xhigh" } as Record<
                  string,
                  string | null
                >,
                input: ["text", "image"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 128000,
                maxTokens: 8192,
              },
            ],
          });
          const registered = modelRuntime.getModel(provider, modelName);
          if (!registered) {
            throw new Error(
              `Pi runner: failed to resolve model "${modelSpec}" after registration.`,
            );
          }
          model = registered;
        }
        applyModelOverrides(model, provider, options.env);

        const forkFrom = options.forkFrom?.trim();
        const resume = options.sessionId?.trim();
        let resumeSessionMissing = false;
        const sessionManager = await (async (): Promise<
          ReturnType<typeof SessionManager.create>
        > => {
          // forkFrom wins over sessionId: snapshot-clone the source session
          // into a fresh session file (new id, header.parentSession = source)
          // and run the current turn on top of that copy. The new id is
          // emitted back via message-metadata so callers can resume from it.
          if (forkFrom) {
            const sourcePath = resolveSessionPathById(cwd, forkFrom);
            console.error(
              `${LOG_PREFIX} fork: sourceId=${forkFrom} sourcePath=${sourcePath ?? "(not found)"}`,
            );
            if (!sourcePath) {
              throw new Error(
                `Pi runner: forkFrom source session not found: ${forkFrom}`,
              );
            }
            // SessionManager.forkFrom copies every non-header entry verbatim
            // into a new file; the OOM guard used on resume does not apply
            // because forkFrom is intended to preserve the full history.
            return SessionManager.forkFrom(sourcePath, cwd);
          }
          if (resume) {
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
            resumeSessionMissing = true;
            console.error(
              `${LOG_PREFIX} resume session missing; starting fresh with transcript fallback`,
            );
            return SessionManager.create(cwd);
          }
          return SessionManager.create(cwd);
        })();
        stripLLMThoughtSignaturesFromSessionManager(sessionManager, model);
        installPiSessionToolHistoryRepair(sessionManager, (stats) => {
          console.error(
            `${LOG_PREFIX} repaired unsafe tool history: calls=${stats.removedToolCalls} results=${stats.removedToolResults} emptyAssistants=${stats.removedEmptyAssistantMessages}`,
          );
        });

        // Create the loader whenever either input is present: systemPrompt is
        // delivered via appendSystemPrompt, so it must not depend on skillPaths.
        const resourceLoader =
          options.skillPaths || options.systemPrompt
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

        // Make `apply_patch` resolvable as a real shell command in bash
        // children. GPT-5.x chains it after other commands
        // (`cd x && apply_patch <<'PATCH'`), which the native tool below
        // cannot intercept — only a PATH entry can.
        const applyPatchShimDir = ensureApplyPatchShim();

        const customTools: ToolDefinition[] =
          options.env && Object.keys(options.env).length > 0
            ? buildSecretAwareTools(cwd, options.env, {
                systemEnv: options.systemEnv,
                pathPrepend: applyPatchShimDir,
              })
            : applyPatchShimDir
              ? [
                  buildEnvInjectedBashTool(
                    cwd,
                    {},
                    { pathPrepend: applyPatchShimDir },
                  ),
                ]
              : [];

        // GPT-5.1 and the Codex model family are trained against OpenAI's
        // apply_patch tool and reach for it by habit even when it isn't
        // exposed — either as an unrecognized bare tool call, or by piping
        // an `apply_patch <<'PATCH'` heredoc through bash, which fails in
        // any sandbox without that binary installed. Registering it
        // natively (only for openai-provider models, since that's the
        // family with this training prior) lets that habit work for us.
        if (provider === "openai") {
          customTools.push(buildApplyPatchTool(cwd));
        }

        if (imageModelName) {
          const auth = await modelRuntime.getAuth(provider, {
            apiKey: inlineApiKey,
            env: options.env,
          });
          const apiKey = auth?.auth.apiKey ?? "";
          customTools.push(
            buildImageGenerateTool(cwd, imageModelName, model.baseUrl, apiKey),
            buildImageEditTool(cwd, imageModelName, model.baseUrl, apiKey),
          );
        }

        const toolRefDefinitions =
          options.toolRefs && options.toolRefs.length > 0
            ? buildToolDefinitionsFromRefs(options.toolRefs)
            : [];

        const { session } = await createAgentSession({
          cwd,
          model,
          sessionManager,
          modelRuntime,
          resourceLoader,
          thinkingLevel: options.effort
            ? (options.effort as ThinkingLevel)
            : undefined,
          tools: options.allowedTools,
          customTools: [
            ...applyAllowedTools(customTools, options.allowedTools),
            ...toolRefDefinitions,
          ],
        });

        const eventQueue: AgentSessionEvent[] = [];
        let promptSettled = false;
        let promptError: unknown;
        let finalAgentEnd:
          | Extract<AgentSessionEvent, { type: "agent_end" }>
          | undefined;
        let aborted = false;
        let wakeConsumer: (() => void) | null = null;

        const notify = () => {
          wakeConsumer?.();
          wakeConsumer = null;
        };

        const unsubscribe = session.subscribe((e) => {
          eventQueue.push(e);
          notify();
        });

        const abortSignal = options.abortController?.signal;
        const abortHandler = () => {
          aborted = true;
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

          const promptText =
            resumeSessionMissing && options.resumeFallbackUserInput?.trim()
              ? options.resumeFallbackUserInput
              : userInput;
          const promptPromise = session.prompt(promptText);
          void promptPromise.then(
            () => {
              promptSettled = true;
              notify();
            },
            (error: unknown) => {
              promptError = error;
              promptSettled = true;
              notify();
            },
          );

          const streamConverter = new PiAISDKStreamConverter({
            sessionId: session.sessionId,
            model,
            normalizeToolOutput: extractToolResultText,
            getUsageFromAgentEndMessages,
            getErrorFromAgentEndMessages,
          });

          while ((!promptSettled && !aborted) || eventQueue.length > 0) {
            while (eventQueue.length > 0) {
              const event = eventQueue.shift()!;
              traceRawMessage(cwd, event, false, options.env);
              if (event.type === "agent_end") {
                finalAgentEnd = event;
                continue;
              }
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

            if (!promptSettled && !aborted && eventQueue.length === 0) {
              await new Promise<void>((resolve) => {
                wakeConsumer = resolve;
              });
            }
          }

          if (aborted) {
            return;
          }

          if (promptError !== undefined) {
            const message =
              promptError instanceof Error
                ? promptError.message
                : "Pi agent run failed.";
            for (const chunk of streamConverter.forceError(message)) {
              yield chunk;
            }
            return;
          }

          if (finalAgentEnd) {
            const chunks = streamConverter.handleEvent(finalAgentEnd, false);
            for (const chunk of chunks) {
              yield chunk;
            }
          } else if (session.agent.state.errorMessage) {
            for (const chunk of streamConverter.forceError(
              session.agent.state.errorMessage,
            )) {
              yield chunk;
            }
          } else {
            for (const chunk of streamConverter.forceError(
              "Pi agent run completed without an agent_end event.",
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
          await modelRuntime.removeRuntimeApiKey(provider);
        }
      }
    },
  };
}
