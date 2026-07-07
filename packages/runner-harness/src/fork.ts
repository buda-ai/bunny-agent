/**
 * Runner-agnostic dispatcher for the "fork an existing session" operation.
 *
 * Mirrors {@link createRunner}: each runner package owns its own fork
 * implementation (or throws a typed "unsupported" error), and this
 * dispatcher fans out by runner id. Currently only the `pi` runner has a
 * real fork; the rest throw {@link RunnerForkUnsupportedError} so the
 * daemon can translate that into a stable client error and fall back to
 * sending the full history as an initial prompt.
 */

import { forkClaudeSession } from "@bunny-agent/runner-claude";
import { forkCodexSession } from "@bunny-agent/runner-codex";
import { forkGeminiSession } from "@bunny-agent/runner-gemini";
import { forkOpenCodeSession } from "@bunny-agent/runner-opencode";
import { ForkSourceNotFoundError, forkPiSession } from "@bunny-agent/runner-pi";

export interface ForkSessionOptions {
  runner: string;
  /** Working directory the session lives under (matches runner sessions dir resolution). */
  cwd: string;
  /** Existing session id already present on disk under `cwd`. */
  sourceSessionId: string;
}

export interface ForkSessionResult {
  runner: string;
  newSessionId: string;
  newSessionPath: string;
  sourcePath: string;
}

/**
 * Thrown when the requested runner does not implement session forking.
 *
 * Each runner package throws its own instance of a class named
 * `RunnerForkUnsupportedError`; we identify them by `name` rather than
 * by class identity to avoid dragging every runner's error class into
 * the harness's public API surface.
 */
export class RunnerForkUnsupportedError extends Error {
  constructor(runner: string) {
    super(`Session fork is not supported for runner: ${runner}`);
    this.name = "RunnerForkUnsupportedError";
  }
}

/** Re-exported so callers can distinguish "source missing" from "runner unsupported". */
export { ForkSourceNotFoundError };

export function forkSession(options: ForkSessionOptions): ForkSessionResult {
  const { runner, cwd, sourceSessionId } = options;
  try {
    return dispatch(runner, cwd, sourceSessionId);
  } catch (err) {
    // Normalize each runner's "unsupported" into the harness's own class
    // so downstream callers only need to check one type. Preserves the
    // runner-supplied message.
    if (err instanceof Error && err.name === "RunnerForkUnsupportedError") {
      const normalized = new RunnerForkUnsupportedError(runner);
      normalized.stack = err.stack;
      throw normalized;
    }
    throw err;
  }
}

function dispatch(
  runner: string,
  cwd: string,
  sourceSessionId: string,
): ForkSessionResult {
  switch (runner) {
    case "pi": {
      const result = forkPiSession({ cwd, sourceSessionId });
      return {
        runner,
        newSessionId: result.newSessionId,
        newSessionPath: result.newSessionPath,
        sourcePath: result.sourcePath,
      };
    }
    case "claude":
      return forkClaudeSession();
    case "codex":
      return forkCodexSession();
    case "gemini":
      return forkGeminiSession();
    case "opencode":
      return forkOpenCodeSession();
    default:
      throw new RunnerForkUnsupportedError(runner);
  }
}
