import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import {
  client,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionUpdate,
  type Usage,
} from "@agentclientprotocol/sdk";

export interface AcpProcessRunnerOptions {
  displayName: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  systemPrompt?: string;
  yolo?: boolean;
}

export interface AcpProcessRunner {
  run(userInput: string): AsyncIterable<string>;
  abort(): void;
}

class AsyncQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private ended = false;
  private error: unknown;

  push(value: T): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
    } else {
      this.values.push(value);
    }
  }

  close(): void {
    if (this.ended) return;
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined, done: true });
    }
  }

  fail(error: unknown): void {
    if (this.ended) return;
    this.ended = true;
    this.error = error;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async () => {
        const value = this.values.shift();
        if (value !== undefined) {
          return { value, done: false };
        }
        if (this.error !== undefined) {
          throw this.error;
        }
        if (this.ended) {
          return { value: undefined, done: true };
        }
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
    };
  }
}

function sseData(value: Record<string, unknown>): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function finishReason(stopReason: string): "stop" | "length" | "error" {
  if (stopReason === "end_turn") return "stop";
  if (stopReason === "max_tokens" || stopReason === "max_turn_requests") {
    return "length";
  }
  return "error";
}

function usageMetadata(usage: Usage | null | undefined): unknown {
  if (!usage) return undefined;
  return {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_read_input_tokens: usage.cachedReadTokens ?? 0,
    cache_creation_input_tokens: usage.cachedWriteTokens ?? 0,
    reasoning_tokens: usage.thoughtTokens ?? 0,
  };
}

async function waitForFileApproval(
  cwd: string,
  request: RequestPermissionRequest,
): Promise<boolean> {
  const rawId = request.toolCall.toolCallId ?? `acp-${Date.now()}`;
  const approvalId = rawId.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const approvalDir = join(cwd, ".bunny-agent", "approvals");
  const approvalFile = join(approvalDir, `${approvalId}.json`);
  mkdirSync(approvalDir, { recursive: true });
  if (!existsSync(approvalFile)) {
    writeFileSync(
      approvalFile,
      JSON.stringify({
        status: "pending",
        toolName: request.toolCall.title,
        input: request.toolCall.rawInput ?? request.toolCall,
        answers: {},
      }),
    );
  }

  const deadline = Date.now() + 60_000;
  try {
    while (Date.now() < deadline) {
      try {
        const approval = JSON.parse(readFileSync(approvalFile, "utf8")) as {
          status?: string;
        };
        if (approval.status === "completed") return true;
        if (approval.status === "rejected") return false;
      } catch {
        // Keep polling while the UI writes or replaces the approval file.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  } finally {
    try {
      unlinkSync(approvalFile);
    } catch {
      // Ignore cleanup failures.
    }
  }
}

async function resolvePermission(
  cwd: string,
  yolo: boolean,
  request: RequestPermissionRequest,
): Promise<RequestPermissionResponse> {
  const approved = yolo || (await waitForFileApproval(cwd, request));
  const desiredKind = approved ? "allow_once" : "reject_once";
  const option = request.options.find(
    (candidate) => candidate.kind === desiredKind,
  );
  if (option) {
    return {
      outcome: { outcome: "selected", optionId: option.optionId },
    };
  }
  return { outcome: { outcome: "cancelled" } };
}

function promptText(
  systemPrompt: string | undefined,
  userInput: string,
): string {
  return systemPrompt ? `${systemPrompt}\n\n${userInput}` : userInput;
}

export function createAcpProcessRunner(
  options: AcpProcessRunnerOptions,
): AcpProcessRunner {
  const cwd = options.cwd ?? process.cwd();
  let activeProcess: ReturnType<typeof spawn> | null = null;

  return {
    async *run(userInput: string): AsyncIterable<string> {
      if (options.abortController?.signal.aborted) {
        yield sseData({
          type: "error",
          errorText: `${options.displayName} run aborted before start.`,
        });
        yield sseData({ type: "finish", finishReason: "error" });
        yield "data: [DONE]\n\n";
        return;
      }

      const output = new AsyncQueue<string>();
      const child = spawn(options.command, options.args ?? [], {
        cwd,
        env: { ...process.env, ...options.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      activeProcess = child;
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.once("error", (error) => output.fail(error));

      const stream = ndJsonStream(
        Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
        Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      );
      const startedText = new Set<string>();
      const startedTools = new Set<string>();
      let aborted = false;

      const closeText = () => {
        for (const id of startedText) {
          output.push(sseData({ type: "text-end", id }));
        }
        startedText.clear();
      };

      const handleUpdate = (update: SessionUpdate) => {
        if (
          update.sessionUpdate === "agent_message_chunk" &&
          update.content.type === "text"
        ) {
          const id = update.messageId ?? "acp-message";
          if (!startedText.has(id)) {
            startedText.add(id);
            output.push(sseData({ type: "text-start", id }));
          }
          output.push(
            sseData({ type: "text-delta", id, delta: update.content.text }),
          );
          return;
        }

        if (
          update.sessionUpdate === "agent_thought_chunk" &&
          update.content.type === "text"
        ) {
          output.push(
            sseData({ type: "reasoning", text: update.content.text }),
          );
          return;
        }

        if (update.sessionUpdate === "tool_call") {
          startedTools.add(update.toolCallId);
          output.push(
            sseData({
              type: "tool-input-start",
              toolCallId: update.toolCallId,
              toolName: update.title,
            }),
          );
          output.push(
            sseData({
              type: "tool-input-available",
              toolCallId: update.toolCallId,
              toolName: update.title,
              input: update.rawInput ?? {},
            }),
          );
          if (update.status === "completed" || update.status === "failed") {
            output.push(
              sseData({
                type: "tool-output-available",
                toolCallId: update.toolCallId,
                output: update.rawOutput ?? update.content ?? null,
                isError: update.status === "failed",
              }),
            );
          }
          return;
        }

        if (update.sessionUpdate === "tool_call_update") {
          if (!startedTools.has(update.toolCallId)) {
            startedTools.add(update.toolCallId);
            output.push(
              sseData({
                type: "tool-input-start",
                toolCallId: update.toolCallId,
                toolName: update.title ?? "tool",
              }),
            );
            output.push(
              sseData({
                type: "tool-input-available",
                toolCallId: update.toolCallId,
                toolName: update.title ?? "tool",
                input: update.rawInput ?? {},
              }),
            );
          }
          if (update.status === "completed" || update.status === "failed") {
            output.push(
              sseData({
                type: "tool-output-available",
                toolCallId: update.toolCallId,
                output: update.rawOutput ?? update.content ?? null,
                isError: update.status === "failed",
              }),
            );
          }
        }
      };

      const app = client({ name: "bunny-agent" }).onRequest(
        methods.client.session.requestPermission,
        ({ params }) => resolvePermission(cwd, options.yolo ?? false, params),
      );

      const workflow = app
        .connectWith(stream, async (context) => {
          await context.request(methods.agent.initialize, {
            protocolVersion: PROTOCOL_VERSION,
            clientCapabilities: {},
          });

          return context.buildSession(cwd).withSession(async (session) => {
            output.push(sseData({ type: "start" }));
            output.push(
              sseData({
                type: "message-metadata",
                messageMetadata: { sessionId: session.sessionId },
              }),
            );

            void session
              .prompt(promptText(options.systemPrompt, userInput))
              .catch((error) => output.fail(error));

            for (;;) {
              const message = await session.nextUpdate();
              if (message.kind === "session_update") {
                handleUpdate(message.update);
                continue;
              }

              closeText();
              const reason = aborted
                ? "error"
                : finishReason(message.stopReason);
              output.push(
                sseData({
                  type: "finish",
                  finishReason: reason,
                  messageMetadata: {
                    sessionId: session.sessionId,
                    usage: usageMetadata(message.response.usage),
                  },
                }),
              );
              output.push("data: [DONE]\n\n");
              output.close();
              return;
            }
          });
        })
        .catch((error) => output.fail(error));

      const abortSignal = options.abortController?.signal;
      const abortHandler = () => {
        aborted = true;
        child.kill();
      };
      abortSignal?.addEventListener("abort", abortHandler, { once: true });
      if (abortSignal?.aborted) abortHandler();

      try {
        for await (const chunk of output) {
          yield chunk;
        }
        await workflow;
      } catch (error) {
        const detail = stderr.trim();
        const message = aborted
          ? `${options.displayName} run aborted by signal.`
          : `${options.displayName} ACP runner failed: ${stringifyError(error)}${detail ? ` (${detail})` : ""}`;
        yield sseData({ type: "error", errorText: message });
        yield sseData({ type: "finish", finishReason: "error" });
        yield "data: [DONE]\n\n";
      } finally {
        abortSignal?.removeEventListener("abort", abortHandler);
        if (!child.killed) child.kill();
        activeProcess = null;
        await workflow;
      }
    },

    abort() {
      activeProcess?.kill();
      activeProcess = null;
    },
  };
}
