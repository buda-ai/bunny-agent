/**
 * Merge `POST /api/coding/run` body `env` into the daemon process environment.
 * Kept in-package so `@sandagent/daemon` does not depend on `@sandagent/manager`.
 * Only string values and valid env-style keys are accepted.
 */

function isValidEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * Normalize `body.env` from JSON (string keys and string values only).
 */
export function sanitizeCodingRunBodyEnv(
  parsed: unknown,
): Record<string, string> | undefined {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isValidEnvKey(k)) continue;
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface CodingRunBodyWithEnv {
  env?: unknown;
}

/**
 * Merge daemon `process.env` with optional inline `env` from the request JSON.
 */
export function mergeCodingRunProcessEnv(
  daemonEnv: Record<string, string>,
  body: CodingRunBodyWithEnv,
): Record<string, string> {
  let merged = { ...daemonEnv };
  const inline = sanitizeCodingRunBodyEnv(body.env);
  if (inline) merged = { ...merged, ...inline };
  return merged;
}
