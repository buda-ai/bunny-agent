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
 * Create a Pi agent runner that outputs AI SDK UI messages
 */
export function createPiRunner(options: PiRunnerOptions = {}): PiRunner {
  const modelStr = options.model || "google:gemini-2.5-flash-lite-preview-06-17";
  const [provider, modelName] = modelStr.split(":");
  const cwd = options.cwd || process.cwd();
  
  const model = getModel(provider as any, modelName);
  
  // Override baseUrl if environment variable is set
  if (provider === "openai" && process.env.OPENAI_BASE_URL) {
    model.baseUrl = process.env.OPENAI_BASE_URL;
  } else if (provider === "google" && process.env.GEMINI_BASE_URL) {
    model.baseUrl = process.env.GEMINI_BASE_URL;
  } else if (provider === "anthropic" && process.env.ANTHROPIC_BASE_URL) {
    model.baseUrl = process.env.ANTHROPIC_BASE_URL;
  }
  
  // Create coding tools (read, bash, edit, write)
  const tools = createCodingTools(cwd);
  
  const agent = new Agent({
    initialState: {
      systemPrompt: options.systemPrompt || "You are a helpful coding assistant.",
      model,
      tools,
    },
  });

  return {
    async *run(userInput: string): AsyncIterable<string> {
      // Collect events in a queue
      const eventQueue: AgentEvent[] = [];
      let isComplete = false;
      
      const unsubscribe = agent.subscribe((e) => {
        eventQueue.push(e);
        if (e.type === "agent_end") {
          isComplete = true;
        }
      });

      try {
        // Start the agent (non-blocking)
        const promptPromise = agent.prompt(userInput);

        // Stream events as they arrive
        while (!isComplete || eventQueue.length > 0) {
          while (eventQueue.length > 0) {
            const event = eventQueue.shift()!;
            
            // Convert Pi Agent events to AI SDK UI format
            if (event.type === "message_update") {
              // Stream text content from assistant messages
              const msg = event.message;
              if (msg.role === "assistant") {
                for (const content of msg.content) {
                  if (content.type === "text" && content.text) {
                    yield `0:${JSON.stringify(content.text)}\n`;
                  } else if (content.type === "thinking" && content.thinking) {
                    // Optionally stream thinking
                    yield `0:${JSON.stringify(`[Thinking] ${content.thinking}`)}\n`;
                  }
                }
              }
            } else if (event.type === "tool_execution_start") {
              yield `9:${JSON.stringify({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                args: event.args,
              })}\n`;
            } else if (event.type === "tool_execution_end") {
              yield `a:${JSON.stringify({
                toolCallId: event.toolCallId,
                result: event.result,
              })}\n`;
            } else if (event.type === "agent_end") {
              yield `d:{"finishReason":"stop"}\n`;
            }
          }

          // Wait a bit before checking again
          if (!isComplete) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }

        // Wait for prompt to complete
        await promptPromise;

        // Handle errors
        if (agent.state.error) {
          yield `3:${JSON.stringify(agent.state.error)}\n`;
        }
      } finally {
        unsubscribe();
      }
    },
  };
}
