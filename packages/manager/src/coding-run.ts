import type {
  BunnyAgentCodingRunBody,
  ExecOptions,
  SandboxHandle,
} from "./types.js";

// NOTE: daemon health probing moved to `@bunny-agent/sandbox-sandock`.

/** Temp directory for the coding-run JSON uploaded before `curl`. */
export const SANDBOX_CODING_RUN_TMP_DIR = "/tmp";

export interface DaemonCodingRunExecParams {
  url: string;
  reqPath: string;
}

function joinSandboxPath(workdir: string, name: string): string {
  const w = workdir.replace(/\/+$/, "");
  return `${w}/${name}`.replace(/\/+/g, "/");
}

function normalizeDaemonBaseUrl(daemonBaseUrl: string): string {
  return daemonBaseUrl.replace(/\/$/, "");
}

/** POSIX sh single-quoted literal (for safe embedding in `sh -c`). */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * One remote shell script: register cleanup on EXIT/INT/TERM, run curl, then exit with curl's status.
 * Improves odds the request JSON file is removed even if the caller’s best-effort `rm` after a failed `exec`
 * never runs. Not absolute: SIGKILL, host crash, or rm failure can still leave the file.
 */
export function buildCodingRunShellScript(
  daemonBaseUrl: string,
  reqPath: string,
): string {
  const url = `${normalizeDaemonBaseUrl(daemonBaseUrl)}/api/coding/run`;
  return (
    `REQ=${shellSingleQuote(reqPath)}` +
    `; trap 'rm -f "$REQ"' EXIT INT TERM` +
    `; curl --fail -sS -N -X POST ${shellSingleQuote(url)}` +
    ` -H ${shellSingleQuote("Content-Type: application/json")}` +
    ` --data-binary @"$REQ"` +
    `; exit $?`
  );
}

/**
 * Build argv for `curl` POST to bunny-agent-daemon `/api/coding/run`.
 *
 * Always passes `--fail` so HTTP 4xx/5xx produce a non-zero exit and stderr.
 * Runner credentials belong in the JSON body `env`, not headers.
 */
export function buildDefaultDaemonCodingRunExecCommand(
  params: DaemonCodingRunExecParams,
): string[] {
  return [
    "curl",
    "--fail",
    "-sS",
    "-N",
    "-X",
    "POST",
    params.url,
    "-H",
    "Content-Type: application/json",
    "--data-binary",
    `@${params.reqPath}`,
  ];
}

export function buildDefaultCodingRunExec(
  daemonBaseUrl: string,
  reqPath: string,
): string[] {
  return buildDefaultDaemonCodingRunExecCommand({
    url: `${normalizeDaemonBaseUrl(daemonBaseUrl)}/api/coding/run`,
    reqPath,
  });
}

/**
 * Best-effort remove request JSON; does not await the background task (shell trap also cleans on normal curl exit).
 * {@link SandboxHandle.exec} is a lazy async iterable: the command does not run until the iterator is consumed.
 */
function scheduleRemoveCodingRunRequestFile(
  handle: SandboxHandle,
  reqPath: string,
  execOpts: ExecOptions,
): void {
  void (async () => {
    try {
      for await (const _ of handle.exec(["/bin/rm", "-f", reqPath], execOpts)) {
        // pull chunks until the process exits (required for exec to complete)
      }
    } catch {
      // ignore — cleanup must not mask the original error
    }
  })();
}

/**
 * Default daemon LLM proxy: write the JSON body into the sandbox under
 * {@link SANDBOX_CODING_RUN_TMP_DIR}, then stream `curl -N POST …/api/coding/run`
 * stdout, then `rm` the file. Requires `curl` in the sandbox image.
 *
 * A temp file is intentional: it can be removed from disk after the request.
 * The curl step runs under `sh -c` with `trap 'rm -f "$REQ"' EXIT INT TERM` so cleanup is tied to
 * that shell. A hard kill (`SIGKILL`), sandbox loss, or `rm` failure can still leave the file — not a cryptographic guarantee.
 * Embedding the body in the remote shell command (e.g. base64) often survives
 * in platform command history and cannot be deleted like a file.
 *
 * Runner credentials belong in {@link BunnyAgentCodingRunBody.env} on `body`.
 * {@link ExecOptions.env} is not used for the POST JSON (put vars in `body.env`).
 *
 * Errors from `upload` / `exec` propagate to the caller unchanged. If `exec` throws after a successful
 * `upload`, a `catch` path schedules best-effort `rm` without awaiting (the remote `trap` may not have run yet).
 */
export async function* streamCodingRunFromSandbox(
  handle: SandboxHandle,
  daemonBaseUrl: string,
  body: BunnyAgentCodingRunBody,
  opts?: ExecOptions,
): AsyncIterable<Uint8Array> {
  // Prefer sandbox-native coding-run streaming when available (Sandock path).
  if (handle.streamCodingRun != null) {
    yield* handle.streamCodingRun(body, opts);
    return;
  }

  const workdir = opts?.cwd ?? handle.getWorkdir();
  const tmpDir = SANDBOX_CODING_RUN_TMP_DIR;

  const { cwd: optCwd, signal, timeout } = opts ?? {};
  const execBase: ExecOptions = {
    cwd: optCwd ?? workdir,
    signal,
    timeout,
  };

  const reqName = `.bunny-agent-coding-req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`;
  const payload = new TextEncoder().encode(JSON.stringify(body));

  const reqPath = joinSandboxPath(tmpDir, reqName);

  await handle.upload([{ path: reqName, content: payload }], tmpDir);

  const shellScript = buildCodingRunShellScript(daemonBaseUrl, reqPath);

  try {
    yield* handle.exec(["/bin/sh", "-c", shellScript], execBase);
  } catch (err) {
    scheduleRemoveCodingRunRequestFile(handle, reqPath, execBase);
    throw err;
  }
}
