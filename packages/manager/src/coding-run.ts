import type {
  ExecOptions,
  SandAgentCodingRunBody,
  SandboxHandle,
} from "./types.js";

// NOTE: daemon health probing moved to `@sandagent/sandbox-sandock`.

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

/**
 * Build argv for `curl` POST to sandagent-daemon `/api/coding/run`.
 *
 * Always passes `--fail` so HTTP 4xx/5xx produce a non-zero exit and stderr.
 * `opts` is accepted for API stability; it does not change argv.
 */
export function buildDefaultDaemonCodingRunExecCommand(
  params: DaemonCodingRunExecParams,
  _opts?: ExecOptions,
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
  opts?: ExecOptions,
): string[] {
  return buildDefaultDaemonCodingRunExecCommand(
    {
      url: `${normalizeDaemonBaseUrl(daemonBaseUrl)}/api/coding/run`,
      reqPath,
    },
    opts,
  );
}

// daemon health probe removed (see note above)

/**
 * Default daemon LLM proxy: write the JSON body into the sandbox, then stream
 * `curl -N POST …/api/coding/run` stdout. Requires `curl` in the sandbox image.
 */
export async function* streamCodingRunFromSandbox(
  handle: SandboxHandle,
  daemonBaseUrl: string,
  body: SandAgentCodingRunBody,
  opts?: ExecOptions,
): AsyncIterable<Uint8Array> {
  const workdir = opts?.cwd ?? handle.getWorkdir();
  const reqName = `.sandagent-coding-req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`;
  const payload = new TextEncoder().encode(JSON.stringify(body));

  await handle.upload([{ path: reqName, content: payload }], workdir);

  const reqPath = joinSandboxPath(workdir, reqName);
  const curlArgs = buildDefaultCodingRunExec(daemonBaseUrl, reqPath, opts);

  try {
    yield* handle.exec(curlArgs, opts);
  } finally {
    try {
      for await (const _ of handle.exec(["rm", "-f", reqPath], {
        cwd: workdir,
      })) {
        // drain
      }
    } catch {
      // best-effort cleanup
    }
  }
}
