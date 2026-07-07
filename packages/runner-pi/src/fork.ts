/**
 * Standalone pi-session fork: takes a source session id that already exists
 * on disk under `cwd`, snapshot-clones it via SessionManager.forkFrom into a
 * fresh session file, and returns the new session id. Unlike the fork path
 * inside `createPiRunner`, this does not start any LLM turn — it only
 * materializes the new session file so callers (e.g. the daemon) can hand
 * the new id back to a client before the first chat request.
 */

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveSessionPathById } from "./session-utils.js";

export interface ForkPiSessionOptions {
  /** Working directory used to locate pi's sessions dir (matches how pi-runner resolves paths). */
  cwd: string;
  /** Source session id already present under `cwd`'s pi sessions directory. */
  sourceSessionId: string;
}

export interface ForkPiSessionResult {
  newSessionId: string;
  newSessionPath: string;
  sourcePath: string;
}

export class ForkSourceNotFoundError extends Error {
  constructor(sourceSessionId: string) {
    super(`Pi fork: source session not found: ${sourceSessionId}`);
    this.name = "ForkSourceNotFoundError";
  }
}

/**
 * Snapshot-clone a source pi session into a fresh session file under the
 * same cwd. The new session file's header carries `parentSession = source`
 * so lineage is preserved.
 *
 * Throws {@link ForkSourceNotFoundError} when the source id cannot be
 * resolved on disk (typical when the copy job has not finished yet or the
 * source id is bogus).
 */
export function forkPiSession(
  options: ForkPiSessionOptions,
): ForkPiSessionResult {
  const { cwd, sourceSessionId } = options;
  const trimmed = sourceSessionId.trim();
  if (!trimmed) {
    throw new ForkSourceNotFoundError(sourceSessionId);
  }

  const sourcePath = resolveSessionPathById(cwd, trimmed);
  if (!sourcePath) {
    throw new ForkSourceNotFoundError(trimmed);
  }

  const mgr = SessionManager.forkFrom(sourcePath, cwd);
  const newSessionId = mgr.getSessionId();
  const newSessionPath = mgr.getSessionFile();
  if (!newSessionPath) {
    // forkFrom without an explicit `inMemory` should always persist, but be
    // defensive so callers get a coherent error instead of a null path.
    throw new Error(
      "Pi fork: SessionManager.forkFrom did not persist a session file",
    );
  }

  return { newSessionId, newSessionPath, sourcePath };
}
