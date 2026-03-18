import { createRunner } from "@sandagent/runner-core";
import type * as http from "node:http";

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
 * POST /api/sandagent/run
 * Streams AI SDK UI NDJSON chunks as SSE or plain stream.
 */
export async function sandagentRun(
  req: RunRequest,
  res: http.ServerResponse,
  env: Record<string, string>,
): Promise<void> {
  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
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
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  } finally {
    res.end();
  }
}
