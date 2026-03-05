/**
 * OpenCode Runner using ACP (Agent Client Protocol)
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export interface OpenCodeRunnerOptions {
  model?: string;
  cwd?: string;
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
      const args = ["acp"];
      if (options.model) args.push("--model", options.model);

      currentProcess = spawn("opencode", args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (!currentProcess.stdin || !currentProcess.stdout)
        throw new Error("Failed to spawn opencode");

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
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const textId = `text_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let hasStarted = false;
      let hasTextStarted = false;

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

          if (msg.id === 1 && msg.result) {
            send("session/new", { cwd, mcpServers: [] }, msgId++);
          }

          if (msg.id === 2 && msg.result) {
            const result = msg.result as { sessionId: string };
            sessionId = result.sessionId;
            send(
              "session/prompt",
              {
                sessionId,
                prompt: [{ type: "text", text: userInput }],
              },
              msgId++,
            );
          }

          // Handle session/prompt response → stream is done
          if (msg.id === 3 && "result" in msg) {
            if (hasTextStarted)
              yield `data: ${JSON.stringify({ type: "text-end", id: textId })}\n\n`;
            yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
            yield `data: [DONE]\n\n`;
            currentProcess.kill();
            return;
          }

          if (msg.method === "session/update" && msg.params?.update) {
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

      currentProcess = null;
    },

    abort() {
      currentProcess?.kill();
      currentProcess = null;
    },
  };
}
