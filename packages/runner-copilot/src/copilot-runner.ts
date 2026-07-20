import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  approveAll,
  CopilotClient,
  type CopilotSession,
  type PermissionHandler,
  type PermissionRequest,
  type SessionEvent,
} from "@github/copilot-sdk";

export type CopilotReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface CopilotRunnerOptions {
  model: string;
  systemPrompt?: string;
  allowedTools?: string[];
  resume?: string;
  yolo?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  reasoningEffort?: CopilotReasoningEffort;
}

export interface CopilotRunner {
  run(userInput: string): AsyncIterable<string>;
  abort(): void;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiters: Array<(value: T) => void> = [];

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(value);
    else this.values.push(value);
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async () => {
        const value = this.values.shift();
        if (value !== undefined) return { value, done: false };
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiters.push((nextValue) =>
            resolve({ value: nextValue, done: false }),
          );
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

function normalizeModel(model: string): string {
  const trimmed = model.trim();
  for (const prefix of ["copilot:", "github-copilot:"]) {
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  }
  return trimmed;
}

function permissionToolName(request: PermissionRequest): string {
  switch (request.kind) {
    case "shell":
      return "shell";
    case "write":
      return "write";
    case "read":
      return "read";
    case "mcp":
    case "custom-tool":
    case "hook":
      return request.toolName;
    case "url":
      return "fetch";
    case "memory":
      return "memory";
    case "extension-management":
      return "extension-management";
    case "extension-permission-access":
      return "extension-permission-access";
  }
}

function createFilePermissionHandler(cwd: string): PermissionHandler {
  return async (request) => {
    const rawId = request.toolCallId ?? `copilot-${Date.now()}`;
    const approvalId = rawId.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const approvalDir = join(cwd, ".bunny-agent", "approvals");
    const approvalFile = join(approvalDir, `${approvalId}.json`);
    mkdirSync(approvalDir, { recursive: true });
    if (!existsSync(approvalFile)) {
      writeFileSync(
        approvalFile,
        JSON.stringify({
          status: "pending",
          toolName: permissionToolName(request),
          input: request,
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
          if (approval.status === "completed") return { kind: "approved" };
          if (approval.status === "rejected") {
            return { kind: "reject", feedback: "Rejected by the user." };
          }
        } catch {
          // Keep polling while the UI writes or replaces the approval file.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return { kind: "reject", feedback: "Approval timed out." };
    } finally {
      try {
        unlinkSync(approvalFile);
      } catch {
        // Ignore cleanup failures.
      }
    }
  };
}

interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
}

export function createCopilotRunner(
  options: CopilotRunnerOptions,
): CopilotRunner {
  const cwd = options.cwd ?? process.cwd();
  let activeClient: CopilotClient | null = null;
  let activeSession: CopilotSession | null = null;

  return {
    async *run(userInput: string): AsyncIterable<string> {
      if (options.abortController?.signal.aborted) {
        yield sseData({
          type: "error",
          errorText: "Copilot run aborted before start.",
        });
        yield sseData({ type: "finish", finishReason: "error" });
        yield "data: [DONE]\n\n";
        return;
      }

      const env = { ...process.env, ...options.env };
      const githubToken = env.GITHUB_TOKEN ?? env.GH_TOKEN;
      const client = new CopilotClient({
        workingDirectory: cwd,
        env,
        gitHubToken: githubToken,
        useLoggedInUser: !githubToken,
      });
      activeClient = client;
      let session: CopilotSession | null = null;
      let unsubscribe: (() => void) | undefined;
      let aborted = false;

      try {
        await client.start();
        const sessionConfig = {
          clientName: "bunny-agent",
          model: normalizeModel(options.model),
          reasoningEffort: options.reasoningEffort,
          workingDirectory: cwd,
          enableConfigDiscovery: true,
          availableTools: options.allowedTools,
          systemMessage: options.systemPrompt
            ? { mode: "append" as const, content: options.systemPrompt }
            : undefined,
          onPermissionRequest: options.yolo
            ? approveAll
            : createFilePermissionHandler(cwd),
        };
        session = options.resume
          ? await client.resumeSession(options.resume, sessionConfig)
          : await client.createSession(sessionConfig);
        activeSession = session;

        const events = new AsyncEventQueue<SessionEvent>();
        unsubscribe = session.on((event) => events.push(event));
        const abortSignal = options.abortController?.signal;
        const abortHandler = () => {
          aborted = true;
          void session?.abort().catch(() => undefined);
        };
        abortSignal?.addEventListener("abort", abortHandler, { once: true });
        if (abortSignal?.aborted) abortHandler();

        const textLengths = new Map<string, number>();
        const openText = new Set<string>();
        const usage: UsageTotals = {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          reasoning: 0,
        };
        let failed = false;

        yield sseData({ type: "start" });
        yield sseData({
          type: "message-metadata",
          messageMetadata: { sessionId: session.sessionId },
        });
        await session.send(userInput);

        try {
          for await (const event of events) {
            if (event.type === "assistant.message_delta") {
              const { messageId, deltaContent } = event.data;
              if (!openText.has(messageId)) {
                openText.add(messageId);
                yield sseData({ type: "text-start", id: messageId });
              }
              textLengths.set(
                messageId,
                (textLengths.get(messageId) ?? 0) + deltaContent.length,
              );
              yield sseData({
                type: "text-delta",
                id: messageId,
                delta: deltaContent,
              });
              continue;
            }

            if (event.type === "assistant.message") {
              const { messageId, content } = event.data;
              if (!openText.has(messageId)) {
                openText.add(messageId);
                yield sseData({ type: "text-start", id: messageId });
              }
              const emitted = textLengths.get(messageId) ?? 0;
              const remaining = content.slice(emitted);
              if (remaining) {
                yield sseData({
                  type: "text-delta",
                  id: messageId,
                  delta: remaining,
                });
              }
              yield sseData({ type: "text-end", id: messageId });
              openText.delete(messageId);
              textLengths.delete(messageId);
              continue;
            }

            if (event.type === "assistant.reasoning_delta") {
              yield sseData({
                type: "reasoning",
                text: event.data.deltaContent,
              });
              continue;
            }

            if (event.type === "tool.execution_start") {
              yield sseData({
                type: "tool-input-start",
                toolCallId: event.data.toolCallId,
                toolName: event.data.toolName,
              });
              yield sseData({
                type: "tool-input-available",
                toolCallId: event.data.toolCallId,
                toolName: event.data.toolName,
                input: event.data.arguments ?? {},
              });
              continue;
            }

            if (event.type === "tool.execution_complete") {
              yield sseData({
                type: "tool-output-available",
                toolCallId: event.data.toolCallId,
                output: event.data.result ?? event.data.error ?? null,
                isError: !event.data.success,
              });
              continue;
            }

            if (event.type === "assistant.usage") {
              usage.input += event.data.inputTokens ?? 0;
              usage.output += event.data.outputTokens ?? 0;
              usage.cacheRead += event.data.cacheReadTokens ?? 0;
              usage.cacheWrite += event.data.cacheWriteTokens ?? 0;
              usage.reasoning += event.data.reasoningTokens ?? 0;
              continue;
            }

            if (event.type === "session.error") {
              failed = true;
              yield sseData({ type: "error", errorText: event.data.message });
              continue;
            }

            if (event.type === "model.call_failure") {
              failed = true;
              yield sseData({
                type: "error",
                errorText:
                  event.data.errorMessage ?? "Copilot model call failed.",
              });
              continue;
            }

            if (event.type === "session.idle") {
              for (const id of openText) {
                yield sseData({ type: "text-end", id });
              }
              yield sseData({
                type: "finish",
                finishReason:
                  failed || aborted || event.data.aborted ? "error" : "stop",
                messageMetadata: {
                  sessionId: session.sessionId,
                  usage: {
                    input_tokens: usage.input,
                    output_tokens: usage.output,
                    cache_read_input_tokens: usage.cacheRead,
                    cache_creation_input_tokens: usage.cacheWrite,
                    reasoning_tokens: usage.reasoning,
                  },
                },
              });
              yield "data: [DONE]\n\n";
              return;
            }
          }
        } finally {
          abortSignal?.removeEventListener("abort", abortHandler);
        }
      } catch (error) {
        yield sseData({
          type: "error",
          errorText: aborted
            ? "Copilot run aborted by signal."
            : `Copilot runner failed: ${stringifyError(error)}`,
        });
        yield sseData({ type: "finish", finishReason: "error" });
        yield "data: [DONE]\n\n";
      } finally {
        unsubscribe?.();
        if (session) {
          try {
            await session.disconnect();
          } catch {
            // Continue with client cleanup.
          }
        }
        try {
          await client.stop();
        } catch {
          await client.forceStop().catch(() => undefined);
        }
        activeSession = null;
        activeClient = null;
      }
    },

    abort() {
      void activeSession?.abort().catch(() => undefined);
      void activeClient?.forceStop().catch(() => undefined);
      activeSession = null;
      activeClient = null;
    },
  };
}
