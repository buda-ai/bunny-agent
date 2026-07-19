import {
  approveAll,
  CopilotClient,
  type CopilotClientOptions,
  type CopilotSession,
  type SessionConfig,
  type SessionEvent,
} from "@github/copilot-sdk";
import type { BaseRunnerOptions } from "./types.js";

export interface CopilotRunnerOptions extends BaseRunnerOptions {
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
}

export interface CopilotRunner {
  run(userInput: string): AsyncIterable<string>;
}

function sseData(obj: Record<string, unknown>): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function normalizeCopilotModel(model: string): string {
  const trimmed = model.trim();
  return trimmed.startsWith("copilot:")
    ? trimmed.slice("copilot:".length)
    : trimmed;
}

/**
 * A tiny promise-based queue that bridges the Copilot SDK's callback-style
 * `session.on(handler)` delivery into an async generator. Producers `push`
 * SSE chunks (or signal completion via `close`) while the consumer awaits
 * `next()` values.
 */
class ChunkQueue {
  private buffer: string[] = [];
  private closed = false;
  private waiter: (() => void) | null = null;

  push(chunk: string): void {
    this.buffer.push(chunk);
    this.wake();
  }

  close(): void {
    this.closed = true;
    this.wake();
  }

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }

  async *drain(): AsyncGenerator<string> {
    while (true) {
      while (this.buffer.length > 0) {
        yield this.buffer.shift() as string;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}

/**
 * Create a GitHub Copilot runner that outputs AI SDK UI message chunks.
 *
 * The Copilot SDK speaks JSON-RPC to the Copilot CLI runtime and delivers
 * session events via `session.on(handler)`. This runner registers a handler,
 * pumps events into a promise-based queue, and re-emits them as the same SSE
 * chunk vocabulary produced by the other BunnyAgent runners.
 */
export function createCopilotRunner(
  options: CopilotRunnerOptions,
): CopilotRunner {
  return {
    async *run(userInput: string): AsyncIterable<string> {
      const clientOptions: CopilotClientOptions = {
        workingDirectory: options.cwd || process.cwd(),
        env: options.env,
      };
      // Explicit token wins over ambient auth when provided.
      const gitHubToken =
        process.env.COPILOT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
      if (gitHubToken) {
        clientOptions.gitHubToken = gitHubToken;
      }

      const client = new CopilotClient(clientOptions);

      const sessionConfig: SessionConfig = {
        model: normalizeCopilotModel(options.model),
        workingDirectory: options.cwd || process.cwd(),
        // Stream assistant.message_delta / assistant.reasoning_delta events so
        // we can forward incremental text instead of waiting for the final
        // assistant.message.
        streaming: true,
        // `approveAll` auto-approves every permission request (shell, file
        // write, MCP, ...). This is effectively "yolo" mode: tools never block
        // on a prompt. Acceptable for headless agent runs; a host that needs
        // gated execution should supply its own PermissionHandler.
        onPermissionRequest: approveAll,
      };
      if (options.systemPrompt) {
        // Append mode keeps the SDK's foundational guardrails and adds the
        // caller's instructions after the SDK-managed sections.
        sessionConfig.systemMessage = {
          mode: "append",
          content: options.systemPrompt,
        };
      }

      const session: CopilotSession = options.resume
        ? await client.resumeSession(options.resume, sessionConfig)
        : await client.createSession(sessionConfig);

      const sessionId = session.sessionId;

      const queue = new ChunkQueue();

      // Incremental text bookkeeping keyed by messageId.
      const startedText = new Set<string>();
      const deltaSeen = new Set<string>();

      // Accumulated token usage across all model calls in this turn.
      const usage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
      };

      let terminalEmitted = false;
      const emitFinish = (finishReason: "stop" | "error"): void => {
        if (terminalEmitted) return;
        terminalEmitted = true;
        queue.push(
          sseData({
            type: "finish",
            finishReason,
            // Usage lives under messageMetadata in snake_case so the SDK
            // provider's normalizeBunnyAgentUsage picks it up.
            messageMetadata: { sessionId, usage },
          }),
        );
        queue.push(`data: [DONE]\n\n`);
      };

      const emitError = (message: string): void => {
        queue.push(sseData({ type: "error", errorText: message }));
      };

      const ensureTextStart = (messageId: string): void => {
        if (startedText.has(messageId)) return;
        startedText.add(messageId);
        queue.push(sseData({ type: "text-start", id: messageId }));
      };

      const handleEvent = (event: SessionEvent): void => {
        switch (event.type) {
          case "assistant.message_start": {
            ensureTextStart(event.data.messageId);
            break;
          }
          case "assistant.message_delta": {
            const { messageId, deltaContent } = event.data;
            ensureTextStart(messageId);
            deltaSeen.add(messageId);
            if (deltaContent) {
              queue.push(
                sseData({
                  type: "text-delta",
                  id: messageId,
                  delta: deltaContent,
                }),
              );
            }
            break;
          }
          case "assistant.message": {
            const { messageId, content } = event.data;
            ensureTextStart(messageId);
            // When streaming produced no deltas (e.g. streaming disabled by the
            // host), emit the full cumulative content as a single delta.
            if (!deltaSeen.has(messageId) && content) {
              queue.push(
                sseData({ type: "text-delta", id: messageId, delta: content }),
              );
            }
            queue.push(sseData({ type: "text-end", id: messageId }));
            break;
          }
          case "assistant.reasoning_delta": {
            const { deltaContent } = event.data;
            if (deltaContent) {
              queue.push(sseData({ type: "reasoning", text: deltaContent }));
            }
            break;
          }
          case "assistant.usage": {
            const d = event.data;
            usage.input_tokens += d.inputTokens ?? 0;
            usage.output_tokens += d.outputTokens ?? 0;
            usage.cache_read_input_tokens += d.cacheReadTokens ?? 0;
            break;
          }
          case "tool.execution_start": {
            const { toolCallId, toolName, arguments: args } = event.data;
            queue.push(
              sseData({ type: "tool-input-start", toolCallId, toolName }),
            );
            queue.push(
              sseData({
                type: "tool-input-available",
                toolCallId,
                toolName,
                input: args ?? {},
              }),
            );
            break;
          }
          case "tool.execution_complete": {
            const { toolCallId, success, result, error } = event.data;
            const output = success
              ? (result?.content ?? result ?? { success })
              : (error?.message ?? "Tool execution failed");
            queue.push(
              sseData({
                type: "tool-output-available",
                toolCallId,
                output,
                isError: !success,
              }),
            );
            break;
          }
          case "session.error": {
            emitError(event.data.message);
            emitFinish("error");
            queue.close();
            break;
          }
          case "model.call_failure": {
            emitError(event.data.errorMessage ?? "Copilot model call failed.");
            emitFinish("error");
            queue.close();
            break;
          }
          case "session.idle": {
            // session.idle is the reliable terminal signal: the whole session
            // (including background agents / attached shells) has gone quiet.
            emitFinish("stop");
            queue.close();
            break;
          }
          default:
            break;
        }
      };

      const unsubscribe = session.on(handleEvent);

      // Wire abort → session.abort().
      const signal = options.abortController?.signal;
      const onAbort = (): void => {
        void session.abort().catch(() => {
          // Ignore abort failures; the queue is closed below regardless.
        });
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort);
        }
      }

      // Emit the opening chunks before any events flow.
      queue.push(sseData({ type: "start" }));
      queue.push(
        sseData({ type: "message-metadata", messageMetadata: { sessionId } }),
      );

      // Drive the turn. sendAndWait resolves once the session becomes idle,
      // giving us a definite completion signal for the queue loop.
      void session
        .sendAndWait(userInput)
        .then(() => {
          queue.close();
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          emitError(message);
          emitFinish("error");
          queue.close();
        });

      try {
        for await (const chunk of queue.drain()) {
          yield chunk;
        }

        // Unexpected-end guard: the queue closed without a terminal event
        // (e.g. the runtime went idle without emitting session.idle, or the
        // process died mid-turn). Synthesize an explicit error so the UI does
        // not stall silently.
        if (!terminalEmitted) {
          yield sseData({
            type: "error",
            errorText: "Copilot stream ended unexpectedly before completing.",
          });
          yield sseData({ type: "finish", finishReason: "error" });
          yield `data: [DONE]\n\n`;
        }
      } finally {
        unsubscribe();
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        await client.stop().catch(() => {
          // Ignore cleanup errors.
        });
      }
    },
  };
}
