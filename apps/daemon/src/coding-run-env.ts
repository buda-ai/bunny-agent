/**
 * Merge `POST /api/coding/run` body `env` into the daemon process environment.
 * Kept in-package so `@bunny-agent/daemon` does not depend on `@bunny-agent/manager`.
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

/**
 * Normalize `body.systemEnv` — same shape rules as `env`. Returned undefined
 * when the field is missing or yields no valid entries so callers can keep
 * the field optional on the wire (forward/back compat).
 */
export function sanitizeCodingRunBodySystemEnv(
  parsed: unknown,
): Record<string, string> | undefined {
  return sanitizeCodingRunBodyEnv(parsed);
}

export interface CodingRunBodyWithEnv {
  env?: unknown;
  systemEnv?: unknown;
}

export interface PreparedCodingRunEnv {
  /** Full env passed to the runner (daemon env + inline body.env). */
  env: Record<string, string>;
  /** Sanitized subset of env keys safe to expose to the bash tool. */
  systemEnv: Record<string, string> | undefined;
}

/**
 * Sanitize and merge env-related fields from a `/api/coding/run` body.
 * Returns the runner env (daemon env + inline `body.env`) and the
 * sanitized `systemEnv` subset, with no body mutation.
 */
export function prepareCodingRunEnv(
  daemonEnv: Record<string, string>,
  body: CodingRunBodyWithEnv,
): PreparedCodingRunEnv {
  const inline = sanitizeCodingRunBodyEnv(body.env);
  const env = inline ? { ...daemonEnv, ...inline } : { ...daemonEnv };
  const systemEnv = sanitizeCodingRunBodySystemEnv(body.systemEnv);
  return { env, systemEnv };
}
