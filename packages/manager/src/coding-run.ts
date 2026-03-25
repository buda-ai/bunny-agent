import type {
  ExecOptions,
  SandAgentCodingRunBody,
  SandboxHandle,
} from "./types.js";

// NOTE: daemon health probing moved to `@sandagent/sandbox-sandock`.

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

/**
 * Build argv for `curl` POST to sandagent-daemon `/api/coding/run`.
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

// daemon health probe removed (see note above)

/**
 * Default daemon LLM proxy: write the JSON body into the sandbox, then stream
 * `curl -N POST …/api/coding/run` stdout. Requires `curl` in the sandbox image.
 *
 * Runner credentials and API keys belong in {@link SandAgentCodingRunBody.env} on
 * `body` (serialized into the POST JSON). {@link ExecOptions.env} is ignored here.
 *
 * The JSON file is written under {@link SANDBOX_CODING_RUN_TMP_DIR}, not the sandbox
 * workdir, and removed after the curl finishes.
 */
export async function* streamCodingRunFromSandbox(
  handle: SandboxHandle,
  daemonBaseUrl: string,
  body: SandAgentCodingRunBody,
  opts?: ExecOptions,
): AsyncIterable<Uint8Array> {
  const workdir = opts?.cwd ?? handle.getWorkdir();
  const tmpDir = SANDBOX_CODING_RUN_TMP_DIR;

  const { cwd: optCwd, signal, timeout } = opts ?? {};

  const reqName = `.sandagent-coding-req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`;
  const payload = new TextEncoder().encode(JSON.stringify(body));

  await handle.upload([{ path: reqName, content: payload }], tmpDir);

  const reqPath = joinSandboxPath(tmpDir, reqName);

  const curlArgs = buildDefaultCodingRunExec(daemonBaseUrl, reqPath);

  try {
    yield* handle.exec(curlArgs, {
      cwd: optCwd ?? workdir,
      signal,
      timeout,
    });
  } finally {
    try {
      const paths = [reqPath];
      for await (const _ of handle.exec(["rm", "-f", ...paths], {
        cwd: tmpDir,
      })) {
        // drain
      }
    } catch {
      // best-effort cleanup
    }
  }
}
