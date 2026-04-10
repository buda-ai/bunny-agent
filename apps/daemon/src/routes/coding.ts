import type * as http from "node:http";
import { createRunner } from "@sandagent/runner-harness";

export interface RunRequest {
  runner?: string;
  model?: string;
  userInput: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  skillPaths?: string[];
  cwd?: string;
  /** Skip tool approval checks (bypass permissions). */
  yolo?: boolean;
  /** Inline runner env (string map); same keys override. */
  env?: Record<string, string>;
}

/**
 * POST /api/coding/run — Node http.ServerResponse version (standalone daemon)
 */
export async function sandagentRun(
  req: RunRequest,
  res: http.ServerResponse,
  env: Record<string, string>,
): Promise<void> {
  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    "Transfer-Encoding": "chunked",
  });

  try {
    const stream = createRunner({
      runner: req.runner ?? "claude",
      model: req.model ?? "claude-sonnet-4-20250514",
      userInput: req.userInput,
      systemPrompt: req.systemPrompt,
      maxTurns: req.maxTurns,
      allowedTools: req.allowedTools,
      resume: req.resume,
      skillPaths: req.skillPaths,
      cwd: req.cwd ?? process.env.SANDAGENT_ROOT ?? "/workspace",
      yolo: req.yolo,
      env,
      abortController,
      autoInject: false, // daemon manages systemPrompt/session explicitly via request body
    });

    for await (const chunk of stream) {
      res.write(chunk);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Keep output format consistent with runner-cli (SSE `data:` events),
    // so the SDK can parse errors uniformly.
    res.write(`data: ${JSON.stringify({ type: "error", errorText: msg })}\n\n`);
    res.write(
      `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n`,
    );
    res.write(`data: [DONE]\n\n`);
  } finally {
    res.end();
  }
}

/**
 * POST /api/coding/run — Web Response version (Next.js embed)
 * Returns a streaming Response with NDJSON body.
 */
export function codingRunStream(
  req: RunRequest,
  env: Record<string, string>,
): Response {
  const abortController = new AbortController();

  const body = new ReadableStream({
    async start(controller) {
      try {
        const stream = createRunner({
          runner: req.runner ?? "claude",
          model: req.model ?? "claude-sonnet-4-20250514",
          userInput: req.userInput,
          systemPrompt: req.systemPrompt,
          maxTurns: req.maxTurns,
          allowedTools: req.allowedTools,
          resume: req.resume,
          skillPaths: req.skillPaths,
          cwd: req.cwd ?? process.env.SANDAGENT_ROOT ?? "/workspace",
          yolo: req.yolo,
          env,
          abortController,
          autoInject: false,
        });
        for await (const chunk of stream) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "error", errorText: msg })}\n\n` +
              `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n` +
              `data: [DONE]\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
