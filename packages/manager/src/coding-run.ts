import type {
  ExecOptions,
  SandAgentCodingRunBody,
  SandboxHandle,
} from "./types.js";

function joinSandboxPath(workdir: string, name: string): string {
  const w = workdir.replace(/\/+$/, "");
  return `${w}/${name}`.replace(/\/+/g, "/");
}

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
  const url = `${daemonBaseUrl.replace(/\/$/, "")}/api/coding/run`;

  const curlArgs = [
    "curl",
    "-sS",
    "-N",
    "-X",
    "POST",
    url,
    "-H",
    "Content-Type: application/json",
    "--data-binary",
    `@${reqPath}`,
  ];

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
