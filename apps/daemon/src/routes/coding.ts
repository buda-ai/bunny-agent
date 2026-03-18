import type * as http from "node:http";
import { createRunner } from "@sandagent/runner-core";

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
      env,
      abortController,
    });

    for await (const chunk of stream) {
      res.write(chunk);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`${JSON.stringify({ error: msg })}\n`);
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
          env,
          abortController,
        });
        for await (const chunk of stream) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ error: msg })}\n`));
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
