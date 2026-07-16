import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type ApprovalMode,
  Codex,
  type Input,
  type ModelReasoningEffort,
  type SandboxMode,
  type ThreadEvent,
  type UserInput,
  type WebSearchMode,
} from "@openai/codex-sdk";
import type { BaseRunnerOptions } from "./types.js";

export interface CodexRunnerOptions extends BaseRunnerOptions {
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  skipGitRepoCheck?: boolean;
  sandboxMode?: SandboxMode;
  approvalPolicy?: ApprovalMode;
  networkAccessEnabled?: boolean;
  webSearchMode?: WebSearchMode;
  modelReasoningEffort?: ModelReasoningEffort;
}

export interface CodexRunner {
  run(userInput: string): AsyncIterable<string>;
}

function normalizeCodexModel(model: string): string {
  const trimmed = model.trim();
  const withoutProvider = trimmed.startsWith("openai:")
    ? trimmed.slice("openai:".length)
    : trimmed;

  // Accept shorthand like "5.2" and normalize to "gpt-5.2".
  if (/^\d+(\.\d+)?$/.test(withoutProvider)) {
    return `gpt-${withoutProvider}`;
  }

  return withoutProvider;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toToolStartPayload(
  event: ThreadEvent,
): { toolCallId: string; toolName: string; args: unknown } | null {
  if (event.type !== "item.started") {
    return null;
  }

  const item = event.item;

  if (item.type === "command_execution") {
    return {
      toolCallId: item.id,
      toolName: "shell",
      args: { command: item.command },
    };
  }

  if (item.type === "mcp_tool_call") {
    return {
      toolCallId: item.id,
      toolName: `${item.server}:${item.tool}`,
      args: item.arguments,
    };
  }

  if (item.type === "web_search") {
    return {
      toolCallId: item.id,
      toolName: "web_search",
      args: { query: item.query },
    };
  }

  return null;
}

function toToolEndPayload(
  event: ThreadEvent,
): { toolCallId: string; result: unknown; isError?: boolean } | null {
  if (event.type !== "item.completed") {
    return null;
  }

  const item = event.item;

  if (item.type === "command_execution") {
    return {
      toolCallId: item.id,
      result: {
        status: item.status,
        exitCode: item.exit_code,
        output: item.aggregated_output,
      },
      isError: item.exit_code !== 0,
    };
  }

  if (item.type === "mcp_tool_call") {
    return {
      toolCallId: item.id,
      result: item.result ?? item.error ?? { status: item.status },
      isError: item.error != null || item.status === "failed",
    };
  }

  if (item.type === "web_search") {
    return {
      toolCallId: item.id,
      result: { query: item.query },
    };
  }

  return null;
}

function sseData(obj: Record<string, unknown>): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/**
 * Tracks incremental text emission for streamed thread items.
 *
 * Codex emits `item.started`/`item.updated`/`item.completed` events where each
 * event carries the full item text so far; this tracker turns them into
 * AI SDK `text-start`/`text-delta`/`text-end` (or `reasoning`) parts.
 */
class ItemTextTracker {
  private emittedLength = new Map<string, number>();
  private started = new Set<string>();

  /** Returns the new delta for this item, or empty string if nothing new. */
  delta(itemId: string, fullText: string): string {
    const emitted = this.emittedLength.get(itemId) ?? 0;
    if (fullText.length <= emitted) return "";
    this.emittedLength.set(itemId, fullText.length);
    return fullText.slice(emitted);
  }

  /** Returns true the first time an item id is seen (caller emits text-start). */
  markStarted(itemId: string): boolean {
    if (this.started.has(itemId)) return false;
    this.started.add(itemId);
    return true;
  }

  isStarted(itemId: string): boolean {
    return this.started.has(itemId);
  }
}

/**
 * Create a Codex runner that outputs AI SDK UI message chunks.
 */
export function createCodexRunner(options: CodexRunnerOptions): CodexRunner {
  const codex = new Codex({
    apiKey: process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    env: options.env,
  });

  return {
    async *run(userInput: string): AsyncIterable<string> {
      const threadOptions = {
        model: normalizeCodexModel(options.model),
        sandboxMode: options.sandboxMode,
        workingDirectory: options.cwd || process.cwd(),
        skipGitRepoCheck: options.skipGitRepoCheck ?? true,
        modelReasoningEffort: options.modelReasoningEffort,
        networkAccessEnabled: options.networkAccessEnabled,
        webSearchMode: options.webSearchMode,
        approvalPolicy: options.approvalPolicy,
      };

      const thread = options.resume
        ? codex.resumeThread(options.resume, threadOptions)
        : codex.startThread(threadOptions);

      let inputToCodex: Input = userInput;
      const tempFiles: string[] = [];
      try {
        if (userInput.startsWith("[") && userInput.endsWith("]")) {
          const parsed = JSON.parse(userInput);
          if (Array.isArray(parsed)) {
            // Codex expects its own UserInput format (text or local_image)
            const parts: UserInput[] = [];
            for (const p of parsed) {
              if (p.type === "image" && typeof p.data === "string") {
                // Write base64 data URL to a temp file for local_image support
                const match = /^data:([^;]+);base64,(.+)$/.exec(p.data);
                if (match) {
                  const ext = match[1].split("/")[1] ?? "png";
                  const tmpPath = path.join(
                    os.tmpdir(),
                    `bunny-agent-img-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
                  );
                  fs.writeFileSync(tmpPath, Buffer.from(match[2], "base64"));
                  tempFiles.push(tmpPath);
                  parts.push({ type: "local_image", path: tmpPath });
                }
                // Non-base64 image URLs are not supported by Codex SDK; skip them.
              } else {
                const text: string =
                  typeof p.text === "string" ? p.text : JSON.stringify(p);
                parts.push({ type: "text", text });
              }
            }
            if (parts.length > 0) {
              inputToCodex = parts;
            }
          }
        }
      } catch (_e) {
        // Fallback to string
      }

      // Emulate systemPrompt on fresh threads: the Codex SDK has no
      // instructions option, so prepend it to the first user input.
      if (options.systemPrompt && !options.resume) {
        if (typeof inputToCodex === "string") {
          inputToCodex = `${options.systemPrompt}\n\n${inputToCodex}`;
        } else {
          inputToCodex = [
            { type: "text", text: options.systemPrompt },
            ...inputToCodex,
          ];
        }
      }

      const streamedTurn = await thread.runStreamed(inputToCodex, {
        signal: options.abortController?.signal,
      });

      let sessionId: string | undefined = options.resume ?? undefined;
      let startEmitted = false;
      let finished = false;
      const textTracker = new ItemTextTracker();
      const reasoningTracker = new ItemTextTracker();

      const ensureStart = (): string[] => {
        if (startEmitted) return [];
        startEmitted = true;
        return [
          sseData({ type: "start" }),
          sseData({
            type: "message-metadata",
            messageMetadata: { sessionId: sessionId ?? thread.id ?? undefined },
          }),
        ];
      };

      for await (const event of streamedTurn.events) {
        if (event.type === "thread.started") {
          sessionId = event.thread_id;
          yield* ensureStart();
          continue;
        }
        yield* ensureStart();

        // Incremental assistant text: item.started/updated/completed all
        // carry the full text so far; emit only the new suffix.
        if (
          (event.type === "item.started" ||
            event.type === "item.updated" ||
            event.type === "item.completed") &&
          event.item.type === "agent_message"
        ) {
          const item = event.item;
          if (textTracker.markStarted(item.id)) {
            yield sseData({ type: "text-start", id: item.id });
          }
          const delta = textTracker.delta(item.id, item.text);
          if (delta) {
            yield sseData({ type: "text-delta", id: item.id, delta });
          }
          if (event.type === "item.completed") {
            yield sseData({ type: "text-end", id: item.id });
          }
          continue;
        }

        // Reasoning: aligned with runner-claude, emitted as "reasoning" parts
        // (deltas only; the stream protocol has no reasoning start/end).
        if (
          (event.type === "item.updated" || event.type === "item.completed") &&
          event.item.type === "reasoning"
        ) {
          const delta = reasoningTracker.delta(event.item.id, event.item.text);
          if (delta) {
            yield sseData({ type: "reasoning", text: delta });
          }
          continue;
        }

        // Non-fatal error items surface inline as text.
        if (event.type === "item.completed" && event.item.type === "error") {
          const id = `error-item-${event.item.id}`;
          yield sseData({ type: "text-start", id });
          yield sseData({
            type: "text-delta",
            id,
            delta: `[Error] ${event.item.message}`,
          });
          yield sseData({ type: "text-end", id });
          continue;
        }

        // File changes (apply_patch) surface as a completed tool call.
        if (
          event.type === "item.completed" &&
          event.item.type === "file_change"
        ) {
          const item = event.item;
          yield sseData({
            type: "tool-input-start",
            toolCallId: item.id,
            toolName: "apply_patch",
          });
          yield sseData({
            type: "tool-input-available",
            toolCallId: item.id,
            toolName: "apply_patch",
            input: { changes: item.changes },
          });
          yield sseData({
            type: "tool-output-available",
            toolCallId: item.id,
            output: { status: item.status, changes: item.changes },
            isError: item.status === "failed",
          });
          continue;
        }

        const toolStart = toToolStartPayload(event);
        if (toolStart) {
          yield sseData({
            type: "tool-input-start",
            toolCallId: toolStart.toolCallId,
            toolName: toolStart.toolName,
          });
          yield sseData({
            type: "tool-input-available",
            toolCallId: toolStart.toolCallId,
            toolName: toolStart.toolName,
            input: toolStart.args,
          });
        }

        const toolEnd = toToolEndPayload(event);
        if (toolEnd) {
          yield sseData({
            type: "tool-output-available",
            toolCallId: toolEnd.toolCallId,
            output: toolEnd.result,
            isError: toolEnd.isError,
          });
        }

        if (event.type === "turn.completed") {
          // Usage goes under messageMetadata in snake_case so the SDK
          // provider's normalizeBunnyAgentUsage picks it up (top-level
          // `usage` on finish chunks is ignored by the provider).
          yield sseData({
            type: "finish",
            finishReason: "stop",
            messageMetadata: {
              sessionId: sessionId ?? thread.id ?? undefined,
              usage: {
                input_tokens: event.usage.input_tokens,
                output_tokens: event.usage.output_tokens,
                cache_read_input_tokens: event.usage.cached_input_tokens,
              },
            },
          });
          yield `data: [DONE]\n\n`;
          finished = true;
        }

        if (event.type === "turn.failed") {
          yield sseData({ type: "error", errorText: event.error.message });
          yield sseData({ type: "finish", finishReason: "error" });
          yield `data: [DONE]\n\n`;
          finished = true;
        }

        if (event.type === "error") {
          yield sseData({
            type: "error",
            errorText: stringifyUnknown(event.message),
          });
          yield sseData({ type: "finish", finishReason: "error" });
          yield `data: [DONE]\n\n`;
          finished = true;
        }
      }

      // The event stream ended without a terminal turn event (e.g. the codex
      // process died mid-turn) — emit an explicit error so the UI does not
      // stall silently.
      if (!finished) {
        yield* ensureStart();
        yield sseData({
          type: "error",
          errorText: "Codex stream ended unexpectedly before completing.",
        });
        yield sseData({ type: "finish", finishReason: "error" });
        yield `data: [DONE]\n\n`;
      }

      // Clean up any temp image files written for local_image inputs
      for (const tmpFile of tempFiles) {
        try {
          fs.unlinkSync(tmpFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    },
  };
}
