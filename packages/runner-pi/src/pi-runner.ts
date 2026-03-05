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

/**
 * Create a Pi agent runner that outputs SSE format (Data Stream Protocol)
 */
export function createPiRunner(options: PiRunnerOptions = {}): PiRunner {
  const modelStr =
    options.model || "google:gemini-2.5-flash-lite-preview-06-17";
  const [provider, modelName] = modelStr.split(":");
  const cwd = options.cwd || process.cwd();

  // biome-ignore lint/suspicious/noExplicitAny: getModel accepts string provider
  const model = getModel(provider as any, modelName);

  // Override baseUrl if environment variable is set
  if (provider === "openai" && process.env.OPENAI_BASE_URL) {
    model.baseUrl = process.env.OPENAI_BASE_URL;
  } else if (provider === "google" && process.env.GEMINI_BASE_URL) {
    model.baseUrl = process.env.GEMINI_BASE_URL;
  } else if (provider === "anthropic" && process.env.ANTHROPIC_BASE_URL) {
    model.baseUrl = process.env.ANTHROPIC_BASE_URL;
  }

  const tools = createCodingTools(cwd);

  const agent = new Agent({
    initialState: {
      systemPrompt:
        options.systemPrompt || "You are a helpful coding assistant.",
      model,
      tools,
    },
  });

  return {
    async *run(userInput: string): AsyncIterable<string> {
      const eventQueue: AgentEvent[] = [];
      let isComplete = false;

      const unsubscribe = agent.subscribe((e) => {
        eventQueue.push(e);
        if (e.type === "agent_end") {
          isComplete = true;
        }
      });

      try {
        const promptPromise = agent.prompt(userInput);

        // Generate unique IDs
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const textId = `text_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        let hasStarted = false;
        let hasTextStarted = false;

        while (!isComplete || eventQueue.length > 0) {
          while (eventQueue.length > 0) {
            const event = eventQueue.shift()!;

            // Emit start event once
            if (!hasStarted && event.type === "message_update") {
              yield `data: ${JSON.stringify({ type: "start", messageId })}\n\n`;
              hasStarted = true;
            }

            if (event.type === "message_update") {
              const msg = event.message;
              if (msg.role === "assistant") {
                for (const content of msg.content) {
                  if (content.type === "text" && content.text) {
                    if (!hasTextStarted) {
                      yield `data: ${JSON.stringify({ type: "text-start", id: textId })}\n\n`;
                      hasTextStarted = true;
                    }
                    yield `data: ${JSON.stringify({ type: "text-delta", id: textId, delta: content.text })}\n\n`;
                  }
                }
              }
            } else if (event.type === "tool_execution_start") {
              yield `data: ${JSON.stringify({ type: "tool-input-start", toolCallId: event.toolCallId, toolName: event.toolName })}\n\n`;
              yield `data: ${JSON.stringify({ type: "tool-input-available", toolCallId: event.toolCallId, toolName: event.toolName, input: event.args })}\n\n`;
            } else if (event.type === "tool_execution_end") {
              yield `data: ${JSON.stringify({ type: "tool-output-available", toolCallId: event.toolCallId, output: event.result })}\n\n`;
            } else if (event.type === "agent_end") {
              if (hasTextStarted) {
                yield `data: ${JSON.stringify({ type: "text-end", id: textId })}\n\n`;
              }
              yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
              yield `data: [DONE]\n\n`;
            }
          }

          if (!isComplete) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }

        await promptPromise;

        if (agent.state.error) {
          yield `data: ${JSON.stringify({ type: "error", errorText: agent.state.error })}\n\n`;
        }
      } finally {
        unsubscribe();
      }
    },
  };
}
