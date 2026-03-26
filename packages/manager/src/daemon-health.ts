import type { ExecOptions, SandboxHandle } from "./types.js";

const HEALTHZ_PATH = "/healthz";

function daemonHealthzUrl(daemonBaseUrl: string): string {
  const normalized = daemonBaseUrl.replace(/\/$/, "");
  const withoutHealthz = normalized.replace(/\/healthz$/i, "");
  return `${withoutHealthz}${HEALTHZ_PATH}`;
}

async function collectExecUtf8(
  iterable: AsyncIterable<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of iterable) {
    out += decoder.decode(chunk, { stream: true });
  }
  out += decoder.decode();
  return out;
}

export type IsSandagentDaemonHealthyOptions = ExecOptions & {
  /** Default 1 — avoid retry storms on every SDK stream. */
  maxAttempts?: number;
  /** Delay between attempts (default 0). */
  delayMs?: number;
};

/** Default exec + curl wall clock for one health probe (ms). */
const DEFAULT_DAEMON_HEALTH_TIMEOUT_MS = 4000;

/**
 * Runs `curl` against `<base>/healthz` inside the sandbox via the handle's `exec` method.
 * Returns true only when the HTTP status line is **200** (`-w '%{http_code}'`).
 *
 * Defaults: **one attempt**, **~4s** budget, and curl `--connect-timeout` / `--max-time` so the
 * command cannot hang much longer than `timeout` even if the adapter is loose.
 */
export async function isSandagentDaemonHealthy(
  handle: SandboxHandle,
  daemonBaseUrl: string,
  opts?: IsSandagentDaemonHealthyOptions,
): Promise<boolean> {
  const healthzUrl = daemonHealthzUrl(daemonBaseUrl);
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 1);
  const delayMs = Math.max(0, opts?.delayMs ?? 0);
  const timeout = Math.min(
    30_000,
    Math.max(500, opts?.timeout ?? DEFAULT_DAEMON_HEALTH_TIMEOUT_MS),
  );
  const cwd = opts?.cwd ?? handle.getWorkdir();
  const maxTimeSec = Math.max(1, Math.ceil(timeout / 1000));
  const connectTimeoutSec = Math.min(maxTimeSec, 5);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const text = await collectExecUtf8(
        handle.exec(
          [
            "curl",
            "-sS",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "--connect-timeout",
            String(connectTimeoutSec),
            "--max-time",
            String(maxTimeSec),
            healthzUrl,
          ],
          {
            cwd,
            timeout,
            signal: opts?.signal,
            env: opts?.env,
          },
        ),
      );
      if (text.trim() === "200") {
        return true;
      }
    } catch {
      // Connection failure, spawn error, timeout, abort, etc.
    }
    if (attempt < maxAttempts && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return false;
}
