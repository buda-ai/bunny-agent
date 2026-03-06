import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Agent, type AgentEvent } from "@mariozechner/pi-agent-core";
import { getModel, type Usage } from "@mariozechner/pi-ai";
import { createCodingTools } from "@mariozechner/pi-coding-agent";

export interface PiRunnerOptions {
  model?: string;
  systemPrompt?: string;
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  /**
   * Session ID for provider caching (see pi-agent-core Agent options).
   * Optional; when set, the agent passes it to the LLM provider.
   * Note: Full session persistence (JSONL tree, resume, branch like the Pi CLI)
   * is not implemented in this runner.
   */
  sessionId?: string;
}

export interface PiRunner {
  run(userInput: string): AsyncIterable<string>;
}

function parseModelSpec(model: string): {
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
 * Debug trace: append raw Pi agent events to a JSON-lines file when DEBUG=true.
 * Same idea as runner-claude's claude-message-stream-debug.json.
 */
function traceRawMessage(
  debugCwd: string,
  data: unknown,
  reset = false,
): void {
  const enabled =
    process.env.DEBUG === "true" || process.env.DEBUG === "1";
  if (!enabled) return;
  try {
    const file = join(debugCwd, "pi-message-stream-debug.json");
    if (reset && existsSync(file)) unlinkSync(file);
    const type = data !== null && typeof data === "object" ? (data as { type?: string }).type : undefined;
    let payload: unknown = data;
    try {
      payload = data !== undefined ? JSON.parse(JSON.stringify(data)) : undefined;
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
 * Create a Pi agent runner that outputs SSE format (Data Stream Protocol)
 */
export function createPiRunner(options: PiRunnerOptions = {}): PiRunner {
  const modelSpec =
    options.model || "google:gemini-2.5-flash-lite-preview-06-17";
  const { provider, modelName } = parseModelSpec(modelSpec);
  const cwd = options.cwd || process.cwd();

  // biome-ignore lint/suspicious/noExplicitAny: getModel accepts provider string unions.
  const model = getModel(provider as any, modelName);
  if (model == null) {
    throw new Error(
      `Pi runner: unsupported model "${modelSpec}". getModel("${provider}", "${modelName}") returned undefined. Use a model from the pi-ai catalog; supported providers are typically: google, openai.`,
    );
  }
  applyModelOverrides(model, provider, options.env);

  const agent = new Agent({
    initialState: {
      systemPrompt:
        options.systemPrompt || "You are a helpful coding assistant.",
      model,
      tools: createCodingTools(cwd),
    },
    ...(options.sessionId !== undefined && options.sessionId !== ""
      ? { sessionId: options.sessionId }
      : {}),
  });

  return {
    async *run(userInput: string): AsyncIterable<string> {
      const eventQueue: AgentEvent[] = [];
      let isComplete = false;
      let aborted = false;
      let wakeConsumer: (() => void) | null = null;

      const notify = () => {
        wakeConsumer?.();
        wakeConsumer = null;
      };

      const unsubscribe = agent.subscribe((e) => {
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
        agent.abort();
        notify();
      };

      if (abortSignal) {
        abortSignal.addEventListener("abort", abortHandler);
        if (abortSignal.aborted) {
          abortHandler();
        }
      }

      try {
        traceRawMessage(cwd, null, true);

        const agentSessionId = (agent as { sessionId?: string }).sessionId;
        const effectiveSessionId =
          (agentSessionId !== undefined && agentSessionId !== "") ||
          (options.sessionId !== undefined && options.sessionId !== "")
            ? (agentSessionId ?? options.sessionId)!
            : randomUUID();
        if (
          (agentSessionId === undefined || agentSessionId === "") &&
          effectiveSessionId
        ) {
          (agent as { sessionId?: string }).sessionId = effectiveSessionId;
        }

        const promptPromise = agent.prompt(userInput);

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const textId = `text_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        let hasStarted = false;
        let hasTextStarted = false;
        let hasFinished = false;

        const ensureStartEvent = async function* () {
          if (!hasStarted) {
            yield `data: ${JSON.stringify({ type: "start", messageId })}\n\n`;
            yield `data: ${JSON.stringify({
              type: "message-metadata",
              messageMetadata: { sessionId: effectiveSessionId },
            })}\n\n`;
            hasStarted = true;
          }
        };

        const finishSuccess = async function* (usage?: Usage) {
          if (hasTextStarted) {
            yield `data: ${JSON.stringify({ type: "text-end", id: textId })}\n\n`;
          }
          const finishPayload: {
            type: "finish";
            finishReason: string;
            messageMetadata?: { usage: Record<string, number> };
          } = { type: "finish", finishReason: "stop" };
          if (usage != null) {
            finishPayload.messageMetadata = {
              usage: usageToMessageMetadata(usage),
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
            traceRawMessage(cwd, event);

            yield* ensureStartEvent();

            if (event.type === "message_update") {
              if (event.assistantMessageEvent.type === "text_delta") {
                const delta = event.assistantMessageEvent.delta;
                if (delta) {
                  if (!hasTextStarted) {
                    yield `data: ${JSON.stringify({ type: "text-start", id: textId })}\n\n`;
                    hasTextStarted = true;
                  }
                  yield `data: ${JSON.stringify({ type: "text-delta", id: textId, delta })}\n\n`;
                }
              }
            } else if (event.type === "tool_execution_start") {
              yield `data: ${JSON.stringify({ type: "tool-input-start", toolCallId: event.toolCallId, toolName: event.toolName })}\n\n`;
              yield `data: ${JSON.stringify({ type: "tool-input-available", toolCallId: event.toolCallId, toolName: event.toolName, input: event.args })}\n\n`;
            } else if (event.type === "tool_execution_end") {
              yield `data: ${JSON.stringify({ type: "tool-output-available", toolCallId: event.toolCallId, output: event.result })}\n\n`;
            } else if (event.type === "agent_end") {
              if (aborted) {
                yield* finishError("Run aborted by signal.");
              } else {
                const usage = getUsageFromAgentEndMessages(event.messages);
                yield* finishSuccess(usage);
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

        if (!hasFinished && agent.state.error) {
          yield* ensureStartEvent();
          yield* finishError(agent.state.error);
        }
      } finally {
        if (abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
        unsubscribe();
      }
    },
  };
}
