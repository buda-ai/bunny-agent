import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { BaseRunnerOptions } from "./types.js";

export interface GeminiRunnerOptions extends BaseRunnerOptions {
  cwd?: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  geminiPath?: string;
}

export interface GeminiRunner {
  run(userInput: string): AsyncIterable<string>;
}

type GeminiStreamEvent = {
  type: string;
  role?: "user" | "assistant";
  content?: string;
  tool_name?: string;
  tool_id?: string;
  parameters?: unknown;
  status?: "success" | "error";
  output?: string;
  error?: { message?: string; type?: string };
  stats?: unknown;
};

export function normalizeGeminiModel(model: string): string {
  const trimmed = model.trim();
  if (trimmed.startsWith("google:")) {
    return trimmed.slice("google:".length);
  }
  if (trimmed.startsWith("gemini:")) {
    return trimmed.slice("gemini:".length);
  }
  return trimmed;
}

export function buildGeminiChildEnv(
  envOverrides?: Record<string, string>,
): Record<string, string> {
  const childEnv: Record<string, string> = {
    ...process.env,
    ...envOverrides,
  } as Record<string, string>;

  // Compatibility shim: many setups use GEMINI_BASE_URL, while Gemini CLI expects
  // GOOGLE_GEMINI_BASE_URL / GOOGLE_VERTEX_BASE_URL.
  if (!childEnv.GOOGLE_GEMINI_BASE_URL && childEnv.GEMINI_BASE_URL) {
    childEnv.GOOGLE_GEMINI_BASE_URL = childEnv.GEMINI_BASE_URL;
  }

  return childEnv;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function mapGeminiEventToChunks(event: GeminiStreamEvent): string[] {
  const chunks: string[] = [];

  if (event.type === "message" && event.role === "assistant" && event.content) {
    chunks.push(`0:${JSON.stringify(event.content)}\n`);
    return chunks;
  }

  if (event.type === "tool_use" && event.tool_id) {
    chunks.push(
      `9:${JSON.stringify({
        toolCallId: event.tool_id,
        toolName: event.tool_name ?? "tool",
        args: event.parameters ?? {},
      })}\n`,
    );
    return chunks;
  }

  if (event.type === "tool_result" && event.tool_id) {
    chunks.push(
      `a:${JSON.stringify({
        toolCallId: event.tool_id,
        result: event.output ?? event.error ?? {},
      })}\n`,
    );
    return chunks;
  }

  if (event.type === "error") {
    chunks.push(`3:${JSON.stringify(event.error?.message ?? event.content ?? "Gemini error")}\n`);
    return chunks;
  }

  if (event.type === "result") {
    const finishReason = event.status === "error" ? "error" : "stop";
    chunks.push(`d:${JSON.stringify({ finishReason, usage: event.stats })}\n`);
    return chunks;
  }

  return chunks;
}

/**
 * Create a Gemini runner that outputs AI SDK UI stream chunks.
 */
export function createGeminiRunner(options: GeminiRunnerOptions): GeminiRunner {
  const geminiPath = options.geminiPath || process.env.GEMINI_CLI_PATH || "gemini";

  return {
    async *run(userInput: string): AsyncIterable<string> {
      const childEnv = buildGeminiChildEnv(options.env);

      const args = [
        "--model",
        normalizeGeminiModel(options.model),
        "--output-format",
        "stream-json",
      ];

      if (options.resume) {
        args.push("--resume", options.resume);
      }

      args.push(userInput);

      const child = spawn(geminiPath, args, {
        cwd: options.cwd || process.cwd(),
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (!child.stdout) {
        yield `3:${JSON.stringify("Gemini process has no stdout stream")}\\n`;
        yield `d:${JSON.stringify({ finishReason: "error" })}\\n`;
        return;
      }

      const abortListener = () => {
        child.kill("SIGTERM");
      };
      options.abortController?.signal.addEventListener("abort", abortListener);

      const stderrChunks: string[] = [];
      child.stderr?.on("data", (chunk) => {
        stderrChunks.push(chunk.toString());
      });

      const lineReader = createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });

      try {
        for await (const line of lineReader) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let event: GeminiStreamEvent;
          try {
            event = JSON.parse(trimmed) as GeminiStreamEvent;
          } catch {
            continue;
          }

          const chunks = mapGeminiEventToChunks(event);
          for (const chunk of chunks) {
            yield chunk;
          }
        }

        const exitCode = await new Promise<number | null>((resolve) => {
          child.once("close", (code) => resolve(code));
        });

        if (exitCode !== 0) {
          const stderrText = stderrChunks.join("").trim();
          if (stderrText) {
            yield `3:${JSON.stringify(stderrText)}\n`;
          }
          yield `d:${JSON.stringify({ finishReason: "error" })}\n`;
        }
      } catch (error) {
        yield `3:${JSON.stringify(stringifyUnknown(error))}\n`;
        yield `d:${JSON.stringify({ finishReason: "error" })}\n`;
      } finally {
        lineReader.close();
        options.abortController?.signal.removeEventListener("abort", abortListener);
      }
    },
  };
}
