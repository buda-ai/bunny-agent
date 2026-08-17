import type * as http from "node:http";
import {
  createRunner,
  type RunnerCoreOptions,
} from "@bunny-agent/runner-harness";

type RunToolRefs = RunnerCoreOptions["toolRefs"];
type RunMcpConfig = RunnerCoreOptions["mcpConfig"];

export interface RunRequest {
  runner?: string;
  model?: string;
  /** Versioned structured input. Preferred over userInput when present. */
  input?: RunnerCoreOptions["input"];
  /** Text-only compatibility fallback for one release. */
  userInput?: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  /**
   * Source pi session id to fork from before running the current turn. When
   * set, the pi runner snapshot-clones the source session into a fresh one
   * (new id, header.parentSession = source) and continues chat on top of the
   * copied history. Mutually exclusive with `resume`.
   *
   * Currently only the `pi` runner consumes this; other runners ignore it.
   */
  forkFrom?: string;
  skillPaths?: string[];
  cwd?: string;
  /** Skip tool approval checks (bypass permissions). */
  yolo?: boolean;
  /** Inline runner env (string map); same keys override. */
  env?: Record<string, string>;
  /**
   * Optional subset of `env` whose keys are safe to expose to the bash tool.
   * When omitted, the runner classifies `env` via a whitelist so business
   * credentials never leak into the shell.
   */
  systemEnv?: Record<string, string>;
  /** Tool refs the runner should expose to the LLM. */
  toolRefs?: RunToolRefs;
  /** Request-scoped MCP servers consumed by the Pi runner. */
  mcpConfig?: RunMcpConfig;
  /** Reasoning effort / thinking level (e.g. "low", "medium", "high"). */
  effort?: string;
}

export const assertRunRequestInput = (req: RunRequest): void => {
  if (req.input === undefined && typeof req.userInput !== "string") {
    throw new Error("Either input or userInput is required");
  }
};

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

const errorEnvelope = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : String(err);
  // Keep output format consistent with runner-cli (SSE `data:` events),
  // so the SDK can parse errors uniformly.
  return (
    `data: ${JSON.stringify({ type: "error", errorText: msg })}\n\n` +
    `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n` +
    `data: [DONE]\n\n`
  );
};

/**
 * Single source of truth for the AI SDK wire stream: validates the request,
 * drives `createRunner`, and terminates with the SSE error envelope on failure.
 * Both the Node and Web adapters below consume this.
 */
export async function* codingRunChunks(
  req: RunRequest,
  env: Record<string, string>,
  abortController: AbortController,
): AsyncIterable<string> {
  try {
    assertRunRequestInput(req);
    const stream = createRunner({
      runner: req.runner ?? "claude",
      model: req.model ?? "claude-sonnet-4-20250514",
      input: req.input,
      userInput: req.userInput,
      systemPrompt: req.systemPrompt,
      maxTurns: req.maxTurns,
      allowedTools: req.allowedTools,
      resume: req.resume,
      forkFrom: req.forkFrom,
      skillPaths: req.skillPaths,
      cwd: req.cwd ?? process.env.BUNNY_AGENT_ROOT ?? "/workspace",
      yolo: req.yolo,
      env,
      systemEnv: req.systemEnv,
      abortController,
      toolRefs: req.toolRefs,
      mcpConfig: req.mcpConfig,
      effort: req.effort,
      // API: caller owns resume/session; do not read/write cwd/.bunny-agent or auto-load CLAUDE.md.
      autoInject: false,
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  } catch (err) {
    yield errorEnvelope(err);
  }
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
    for await (const chunk of codingRunChunks(req, env, abortController)) {
      res.write(chunk);
    }
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
  try {
    assertRunRequestInput(req);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
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
        for await (const chunk of codingRunChunks(req, env, abortController)) {
          controller.enqueue(encoder.encode(chunk));
        }
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
