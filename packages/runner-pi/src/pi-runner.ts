import { Agent, type AgentEvent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { createCodingTools } from "@mariozechner/pi-coding-agent";

export interface PiRunnerOptions {
  model?: string;
  systemPrompt?: string;
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
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
 * Create a Pi agent runner that outputs SSE format (Data Stream Protocol)
 */
export function createPiRunner(options: PiRunnerOptions = {}): PiRunner {
  const modelSpec =
    options.model || "google:gemini-2.5-flash-lite-preview-06-17";
  const { provider, modelName } = parseModelSpec(modelSpec);
  const cwd = options.cwd || process.cwd();

  // biome-ignore lint/suspicious/noExplicitAny: getModel accepts provider string unions.
  const model = getModel(provider as any, modelName);
  applyModelOverrides(model, provider, options.env);

  const agent = new Agent({
    initialState: {
      systemPrompt:
        options.systemPrompt || "You are a helpful coding assistant.",
      model,
      tools: createCodingTools(cwd),
    },
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
        const promptPromise = agent.prompt(userInput);

        // Generate unique IDs
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const textId = `text_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        let hasStarted = false;
        let hasTextStarted = false;
        let hasFinished = false;

        const ensureStartEvent = async function* () {
          if (!hasStarted) {
            yield `data: ${JSON.stringify({ type: "start", messageId })}\n\n`;
            hasStarted = true;
          }
        };

        const finishSuccess = async function* () {
          if (hasTextStarted) {
            yield `data: ${JSON.stringify({ type: "text-end", id: textId })}\n\n`;
          }
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
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
                yield* finishSuccess();
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
