/**
 * Session lifecycle routes.
 *
 * Currently only exposes `fork`, which snapshot-clones an existing pi
 * session file that already lives under the sandbox's volume into a fresh
 * session file, and returns the new session id. This lets a caller confirm
 * — before starting any LLM turn — that fork is supported by the runner
 * baked into this daemon image and that the source session was actually
 * clonable. When the runner does not support forking (claude/codex/gemini
 * etc.) or the source id is not found on disk, the caller gets a typed
 * failure envelope and can fall back to sending the full history as an
 * initial prompt.
 */

import {
  ForkSourceNotFoundError,
  forkSession,
  RunnerForkUnsupportedError,
} from "@bunny-agent/runner-harness";
import type { AppState } from "../utils.js";
import { AppError, ok, resolveVolumeRoot } from "../utils.js";

export interface SessionForkBody {
  /** Volume that hosts the runner's sessions dir. Defaults to daemon root when omitted. */
  volume?: string;
  /** Runner id ("pi", "claude", ...). Anything other than a fork-capable runner returns 400. */
  runner: string;
  /** Source session id already present on disk under the resolved volume. */
  sourceSessionId: string;
}

export async function sessionFork(state: AppState, body: SessionForkBody) {
  if (!body || typeof body !== "object") {
    throw new AppError(400, "session fork: request body required");
  }
  if (!body.runner || typeof body.runner !== "string") {
    throw new AppError(400, "session fork: 'runner' is required");
  }
  if (!body.sourceSessionId || typeof body.sourceSessionId !== "string") {
    throw new AppError(400, "session fork: 'sourceSessionId' is required");
  }

  const cwd = resolveVolumeRoot(state, body.volume);
  try {
    const result = forkSession({
      runner: body.runner,
      cwd,
      sourceSessionId: body.sourceSessionId,
    });
    return ok({
      runner: result.runner,
      newSessionId: result.newSessionId,
      newSessionPath: result.newSessionPath,
      sourcePath: result.sourcePath,
    });
  } catch (err: unknown) {
    if (err instanceof RunnerForkUnsupportedError) {
      // 400: the client asked for something this daemon build cannot do;
      // it's a stable answer, no retry will help. Client should fall back.
      throw new AppError(400, (err as Error).message);
    }
    if (err instanceof ForkSourceNotFoundError) {
      // 404 so clients can distinguish "not there yet / bad id" from
      // "runner can't fork at all". Typical cause: the cross-sandbox copy
      // job has not landed the source jsonl yet.
      throw new AppError(404, (err as Error).message);
    }
    throw err;
  }
}
