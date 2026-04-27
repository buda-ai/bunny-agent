import type * as http from "node:http";
import { createRunner } from "@bunny-agent/runner-harness";
import { formatUnknownError } from "../utils.js";

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

/** SSE comment keepalive interval (ms). Prevents idle-timeout disconnects
 *  from reverse proxies or sandbox shell APIs during long tool executions. */
let _heartbeatIntervalMs = 15_000;
export const HEARTBEAT_COMMENT = ": heartbeat\n\n";

/** Get current heartbeat interval. */
export function getHeartbeatIntervalMs(): number {
  return _heartbeatIntervalMs;
}

/** Override heartbeat interval — exposed for testing only. */
export function setHeartbeatIntervalMs(ms: number): void {
  _heartbeatIntervalMs = ms;
}

/**
 * POST /api/coding/run — Node http.ServerResponse version (standalone daemon)
 */
export async function bunnyAgentRun(
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

  // Heartbeat: write an SSE comment periodically to keep the connection alive
  // during long-running tool executions (e.g. image generation).
  const heartbeat = setInterval(() => {
    if (!res.destroyed) {
      res.write(HEARTBEAT_COMMENT);
    }
  }, getHeartbeatIntervalMs());

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
      cwd: req.cwd ?? process.env.BUNNY_AGENT_ROOT ?? "/workspace",
      yolo: req.yolo,
      env,
      abortController,
      // API: caller owns resume/session; do not read/write cwd/.bunny-agent or auto-load CLAUDE.md.
      autoInject: false,
    });

    for await (const chunk of stream) {
      res.write(chunk);
    }
  } catch (err) {
    const msg = formatUnknownError(err);
    // Keep output format consistent with runner-cli (SSE `data:` events),
    // so the SDK can parse errors uniformly.
    res.write(`data: ${JSON.stringify({ type: "error", errorText: msg })}\n\n`);
    res.write(
      `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n`,
    );
    res.write(`data: [DONE]\n\n`);
  } finally {
    clearInterval(heartbeat);
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
      const encoder = new TextEncoder();

      // Heartbeat: enqueue an SSE comment periodically to keep the connection
      // alive during long-running tool executions.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(HEARTBEAT_COMMENT));
        } catch {
          // controller may already be closed
        }
      }, getHeartbeatIntervalMs());

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
          cwd: req.cwd ?? process.env.BUNNY_AGENT_ROOT ?? "/workspace",
          yolo: req.yolo,
          env,
          abortController,
          autoInject: false,
        });
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const msg = formatUnknownError(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", errorText: msg })}\n\n` +
              `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n` +
              `data: [DONE]\n\n`,
          ),
        );
      } finally {
        clearInterval(heartbeat);
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
