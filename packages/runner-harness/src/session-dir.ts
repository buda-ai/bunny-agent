import { getSessionDir as getPiSessionDir } from "@bunny-agent/runner-pi";

/**
 * Resolve the on-disk sessions directory for a given runner + cwd.
 *
 * Runners persist session files under different conventions:
 *   - `pi` — `<piConfigDir>/agent/sessions/<encoded-cwd>/*.jsonl` (from
 *     pi-mono's `SessionManager.getSessionDir`)
 *   - other runners — currently not exposed; each may compute its own
 *     directory when needed.
 *
 * External orchestrators (e.g. buda's share-copy job) call this via the
 * daemon HTTP surface to locate session files across sandboxes without
 * duplicating each runner's path convention.
 *
 * @throws If the runner does not support session-dir introspection.
 */
export function getSessionDirForRunner(runner: string, cwd: string): string {
  switch (runner) {
    case "pi":
      return getPiSessionDir(cwd);
    default:
      throw new Error(`getSessionDir not supported for runner: ${runner}`);
  }
}
