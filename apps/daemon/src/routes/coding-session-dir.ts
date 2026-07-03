import { getSessionDirForRunner } from "@bunny-agent/runner-harness";

export interface CodingSessionDirQuery {
  runner?: string;
  cwd?: string;
}

export interface CodingSessionDirResult {
  runner: string;
  cwd: string;
  /** Absolute path to the runner's on-disk sessions directory for this cwd. */
  dir: string;
}

const DEFAULT_CWD = "/agent";

/**
 * GET /api/coding/session/dir?runner=pi&cwd=/agent
 *
 * Returns the absolute path to the runner's sessions directory inside this
 * sandbox. Currently only the pi runner is supported (see runner-harness).
 *
 * External orchestrators (e.g. buda's share-copy job) use this to locate
 * a specific session file across sandboxes via sandock fs.list/read/write,
 * without duplicating each runner's path convention (pi's `configDir`,
 * cwd encoding, etc.).
 *
 * Throws when the runner doesn't support session-dir introspection.
 */
export function codingSessionDir(
  query: CodingSessionDirQuery,
): CodingSessionDirResult {
  const runner = (query.runner ?? "pi").trim() || "pi";
  const cwd = (query.cwd ?? DEFAULT_CWD).trim() || DEFAULT_CWD;
  const dir = getSessionDirForRunner(runner, cwd);
  return { runner, cwd, dir };
}
