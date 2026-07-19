/**
 * OpenCode Runner using ACP (Agent Client Protocol)
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

export interface OpenCodeRunnerOptions {
  model?: string;
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  /**
   * ACP session id to resume. Only honored when the agent advertises the
   * `loadSession` capability in its initialize response; otherwise a new
   * session is created.
   */
  resume?: string;
}

export interface OpenCodeRunner {
  run(userInput: string): AsyncIterable<string>;
  abort(): void;
}

export function createOpenCodeRunner(
  options: OpenCodeRunnerOptions = {},
): OpenCodeRunner {
  const cwd = options.cwd || process.cwd();
  let currentProcess: ChildProcess | null = null;

  return {
    async *run(userInput: string) {
      if (options.abortController?.signal.aborted) {
        yield `data: ${JSON.stringify({ type: "error", errorText: "Run aborted before start." })}\n\n`;
        yield `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n`;
        yield "data: [DONE]\n\n";
        return;
      }

      const args = ["acp"];
      if (options.model) args.push("--model", options.model);
      let aborted = false;
      let completed = false;

      currentProcess = spawn("opencode", args, {
        cwd,
        env: { ...process.env, ...options.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (!currentProcess.stdin || !currentProcess.stdout)
        throw new Error("Failed to spawn opencode");

      const abortSignal = options.abortController?.signal;
      const abortHandler = () => {
        aborted = true;
        currentProcess?.kill();
      };
      if (abortSignal) {
        abortSignal.addEventListener("abort", abortHandler);
      }

      let msgId = 1;
      const send = (method: string, params: unknown, id?: number) => {
        const msg = JSON.stringify({
          jsonrpc: "2.0",
          method,
          params,
          ...(id ? { id } : {}),
        });
        currentProcess!.stdin!.write(msg + "\n");
      };

      send(
        "initialize",
        { protocolVersion: 1, clientCapabilities: {} },
        msgId++,
      );

      let sessionId: string | null = null;
      let resuming = false;
      let promptSent = false;
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const textId = `text_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let hasStarted = false;
      let hasTextStarted = false;

      const sendPrompt = () => {
        promptSent = true;
        send(
          "session/prompt",
          {
            sessionId,
            prompt: [{ type: "text", text: userInput }],
          },
          msgId++,
        );
      };

      try {
        let buffer = "";
        for await (const chunk of currentProcess.stdout) {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let msg: {
              id?: number;
              result?: unknown;
              method?: string;
              params?: {
                update?: {
                  sessionUpdate?: string;
                  content?: { type: string; text?: string };
                };
                sessionId?: string;
              };
            };
            try {
              msg = JSON.parse(line);
            } catch {
              continue;
            }

            // Handle initialize response → load or create session
            if (msg.id === 1 && msg.result) {
              const initResult = msg.result as {
                agentCapabilities?: { loadSession?: boolean };
              };
              if (options.resume && initResult.agentCapabilities?.loadSession) {
                resuming = true;
                send(
                  "session/load",
                  { sessionId: options.resume, cwd, mcpServers: [] },
                  msgId++,
                );
              } else {
                send("session/new", { cwd, mcpServers: [] }, msgId++);
              }
            }

            // Handle session/new or session/load response → send prompt.
            // Note: session/load responds with a null result, so check for
            // the presence of the result key rather than truthiness.
            if (msg.id === 2 && "result" in msg) {
              if (resuming) {
                sessionId = options.resume as string;
              } else {
                const result = msg.result as { sessionId: string };
                sessionId = result.sessionId;
              }
              if (!hasStarted) {
                yield `data: ${JSON.stringify({ type: "start", messageId })}\n\n`;
                hasStarted = true;
              }
              yield `data: ${JSON.stringify({ type: "message-metadata", messageMetadata: { sessionId } })}\n\n`;
              sendPrompt();
            }

            // Handle session/prompt response → stream is done
            if (msg.id === 3 && "result" in msg) {
              if (hasTextStarted)
                yield `data: ${JSON.stringify({ type: "text-end", id: textId })}\n\n`;
              yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
              yield `data: [DONE]\n\n`;
              completed = true;
              currentProcess.kill();
              return;
            }

            // Updates that arrive before the prompt was sent are history
            // replayed by session/load; skip them so resumed runs only
            // stream new output.
            if (
              msg.method === "session/update" &&
              msg.params?.update &&
              promptSent
            ) {
              const update = msg.params.update;

              if (!hasStarted) {
                yield `data: ${JSON.stringify({ type: "start", messageId })}\n\n`;
                hasStarted = true;
              }

              if (
                update.sessionUpdate === "agent_message_chunk" &&
                update.content?.type === "text" &&
                update.content.text
              ) {
                if (!hasTextStarted) {
                  yield `data: ${JSON.stringify({ type: "text-start", id: textId })}\n\n`;
                  hasTextStarted = true;
                }
                yield `data: ${JSON.stringify({ type: "text-delta", id: textId, delta: update.content.text })}\n\n`;
              }
            }
          }
        }

        if (!completed) {
          const errorText = aborted
            ? "OpenCode run aborted by signal."
            : "OpenCode ACP process exited before completion.";
          yield `data: ${JSON.stringify({ type: "error", errorText })}\n\n`;
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n`;
          yield "data: [DONE]\n\n";
        }
      } finally {
        if (abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
        currentProcess = null;
      }
    },

    abort() {
      currentProcess?.kill();
      currentProcess = null;
    },
  };
}
