/**
 * Ask an in-sandbox bunny-agent-daemon where a given runner keeps its
 * session files on disk. Wraps the daemon `GET /api/coding/session/dir`
 * endpoint so SDK consumers (e.g. product code that shares/copies pi
 * sessions across agents) don't need to hand-craft the request and parse
 * the envelope.
 *
 * @example
 * ```ts
 * import { getBunnyAgentSessionDir } from "@bunny-agent/sdk";
 *
 * const dir = await getBunnyAgentSessionDir(sandockProxyUrl, {
 *   runner: "pi",
 *   cwd: "/agent",
 * });
 * // dir = "/root/.pi/agent/sessions/--agent--"
 * ```
 */

export interface GetBunnyAgentSessionDirOptions {
  /**
   * Which runner's session directory to resolve. Defaults to `"pi"`; only
   * the pi runner is supported by the daemon today. Other runners will
   * surface a runtime error from the daemon.
   */
  runner?: string;
  /**
   * cwd whose sessions directory to resolve. Defaults to `"/agent"`,
   * matching the bunny-agent sandbox convention. Callers pass this only
   * when the runner is configured to use a non-default cwd.
   */
  cwd?: string;
  /** Abort the underlying fetch. */
  signal?: AbortSignal;
}

const DEFAULT_RUNNER = "pi";
const DEFAULT_CWD = "/agent";

function buildSessionDirUrl(
  daemonBaseUrl: string,
  runner: string,
  cwd: string,
): string {
  const normalized = daemonBaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ runner, cwd });
  return `${normalized}/api/coding/session/dir?${params.toString()}`;
}

/**
 * Resolve the runner's on-disk sessions directory inside the sandbox that
 * `daemonBaseUrl` fronts. `daemonBaseUrl` is the same URL you pass to
 * `createBunnyAgent({ daemonUrl })` — typically a sandock proxy URL that
 * routes to the in-sandbox daemon at `:3080`.
 *
 * Throws when the daemon is unreachable, the response isn't valid JSON,
 * or the daemon returns a failure envelope (e.g. unsupported runner).
 */
export async function getBunnyAgentSessionDir(
  daemonBaseUrl: string,
  opts?: GetBunnyAgentSessionDirOptions,
): Promise<string> {
  const runner = (opts?.runner ?? DEFAULT_RUNNER).trim() || DEFAULT_RUNNER;
  const cwd = (opts?.cwd ?? DEFAULT_CWD).trim() || DEFAULT_CWD;
  const url = buildSessionDirUrl(daemonBaseUrl, runner, cwd);

  let res: Response;
  try {
    res = await fetch(url, { signal: opts?.signal });
  } catch (err) {
    throw new Error(
      `getBunnyAgentSessionDir: request to ${url} failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `getBunnyAgentSessionDir: daemon response was not valid JSON (status ${res.status}): ${
        err instanceof Error ? err.message : String(err)
      } — got: ${text.slice(0, 200)}`,
    );
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !(payload as { ok?: unknown }).ok
  ) {
    const error = (payload as { error?: unknown }).error;
    throw new Error(
      `getBunnyAgentSessionDir: daemon returned failure (status ${res.status})${
        typeof error === "string" ? `: ${error}` : ""
      }`,
    );
  }

  const data = (payload as { data?: unknown }).data;
  const dir = (data as { dir?: unknown } | undefined)?.dir;
  if (typeof dir !== "string" || dir.length === 0) {
    throw new Error(
      `getBunnyAgentSessionDir: response missing 'data.dir' (got: ${text.slice(0, 200)})`,
    );
  }
  return dir;
}
