import type { ExecOptions } from "@sandagent/manager";

export const SANDAGENT_DAEMON_HEALTHZ_PATH = "/healthz";

function normalizeDaemonBaseUrl(daemonBaseUrl: string): string {
  return daemonBaseUrl.replace(/\/$/, "");
}

export function buildDaemonHealthzUrl(daemonBaseUrl: string): string {
  // Accept both ".../healthz" and "... (base)" forms by stripping a
  // trailing `/healthz` before appending.
  const normalized = normalizeDaemonBaseUrl(daemonBaseUrl);
  const withoutHealthz = normalized.replace(/\/healthz$/i, "");
  return `${withoutHealthz}${SANDAGENT_DAEMON_HEALTHZ_PATH}`;
}

function isHealthyDaemonResponse(text: string): boolean {
  if (!text || /^(ok|healthy)$/i.test(text)) return true;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return false;
    const record = parsed as Record<string, unknown>;
    if (record.ok === true) return true;
    const status = record.status;
    if (typeof status === "string" && /^(ok|healthy)$/i.test(status))
      return true;
    const data = record.data;
    if (data && typeof data === "object") {
      const nestedStatus = (data as Record<string, unknown>).status;
      if (
        typeof nestedStatus === "string" &&
        /^(ok|healthy)$/i.test(nestedStatus)
      ) {
        return true;
      }
    }
  } catch {
    // non-JSON response, keep fallback checks only
  }
  return false;
}

export type ProbeSandagentDaemonHealthOptions = ExecOptions & {
  maxAttempts?: number;
  delayMs?: number;
};

export interface SandockHealthCheckHandle {
  runCommand(
    cmd: string,
    timeoutMs?: number,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export async function probeSandagentDaemonHealth(
  handle: SandockHealthCheckHandle,
  daemonBaseUrl: string,
  opts?: ProbeSandagentDaemonHealthOptions,
): Promise<void> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 3);
  const delayMs = Math.max(0, opts?.delayMs ?? 1000);
  const timeoutMs = opts?.timeout;
  const healthzUrl = buildDaemonHealthzUrl(daemonBaseUrl);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { exitCode, stdout, stderr } = await handle.runCommand(
        `curl -fsS '${healthzUrl.replace(/'/g, "'\\''")}'`,
        timeoutMs,
      );
      if (exitCode !== 0) {
        throw new Error(
          `curl exited with code ${exitCode}${stderr ? `: ${stderr.trim().slice(0, 200)}` : ""}`,
        );
      }

      const text = stdout.trim();
      if (isHealthyDaemonResponse(text)) {
        return;
      }
      throw new Error(
        `Unexpected healthz response from sandagent-daemon: ${text.slice(0, 200)}`,
      );
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `sandagent-daemon health check failed after ${maxAttempts} attempt(s): ${message}`,
  );
}
