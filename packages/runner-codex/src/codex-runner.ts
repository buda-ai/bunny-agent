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

function toAssistantText(event: ThreadEvent): string | null {
  if (event.type === "item.completed" && event.item.type === "agent_message") {
    return event.item.text;
  }

  if (event.type === "item.completed" && event.item.type === "reasoning") {
    return `[Reasoning] ${event.item.text}`;
  }

  if (event.type === "item.completed" && event.item.type === "error") {
    return `[Error] ${event.item.message}`;
  }

  return null;
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
                    `sandagent-img-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
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

      const streamedTurn = await thread.runStreamed(inputToCodex, {
        signal: options.abortController?.signal,
      });

      for await (const event of streamedTurn.events) {
        const assistantText = toAssistantText(event);
        if (assistantText) {
          yield `data: ${JSON.stringify({ type: "text-delta", delta: assistantText })}\n\n`;
        }

        const toolStart = toToolStartPayload(event);
        if (toolStart) {
          yield `data: ${JSON.stringify({ type: "tool-input-start", toolCallId: toolStart.toolCallId, toolName: toolStart.toolName })}\n\n`;
          yield `data: ${JSON.stringify({ type: "tool-input-available", toolCallId: toolStart.toolCallId, toolName: toolStart.toolName, input: toolStart.args })}\n\n`;
        }

        const toolEnd = toToolEndPayload(event);
        if (toolEnd) {
          yield `data: ${JSON.stringify({ type: "tool-output-available", toolCallId: toolEnd.toolCallId, output: toolEnd.result, isError: toolEnd.isError })}\n\n`;
        }

        if (event.type === "turn.completed") {
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop", usage: event.usage })}\n\n`;
          yield `data: [DONE]\n\n`;
        }

        if (event.type === "turn.failed") {
          yield `data: ${JSON.stringify({ type: "error", errorText: event.error.message })}\n\n`;
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n`;
          yield `data: [DONE]\n\n`;
        }

        if (event.type === "error") {
          yield `data: ${JSON.stringify({ type: "error", errorText: stringifyUnknown(event.message) })}\n\n`;
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n`;
          yield `data: [DONE]\n\n`;
        }
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
