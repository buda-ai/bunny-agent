/**
 * Retry helper for transient network failures against the Sandock API.
 *
 * Real-world motivation: a CI run hit `TypeError: terminated` (cause:
 * `SocketError: other side closed`, code `UND_ERR_SOCKET`) mid-request
 * against production sandock.ai — a one-off connection drop between the
 * runner and Cloudflare, not an application error. Nothing in the adapter
 * retried it, so the whole sandbox operation failed outright.
 *
 * Only applied to calls that are safe to retry blindly:
 * - Reads (`sandbox.get`, `volume.getByName`, `fs.read`) — no side effects.
 * - Idempotent lifecycle calls (`sandbox.start`, `sandbox.stop`,
 *   `sandbox.delete`, `fs.write` with the same content/path) — repeating
 *   them is safe even if the first attempt actually landed server-side.
 * - `sandbox.create` — retried too, accepting a small, known risk: if the
 *   create request reached the server but the *response* was lost to the
 *   same kind of transient drop, a retry could create a second sandbox.
 *   Sandock's API has no idempotency-key mechanism to close that gap, and
 *   leaving `create` unprotected would leave exactly the operation that
 *   flaked in CI unprotected too.
 *
 * Deliberately NOT applied to `sandbox.shell` (the exec/runCommand path):
 * an arbitrary user command can have already caused side effects (wrote
 * files, started a process) before the connection dropped — blindly
 * re-running it risks double-executing something that isn't idempotent.
 */

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Delay before the first retry; doubles each subsequent attempt. Default 300ms. */
  baseDelayMs?: number;
}

const TRANSIENT_ERROR_PATTERNS: RegExp[] = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EPIPE/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /UND_ERR_SOCKET/i,
  /UND_ERR_CONNECT_TIMEOUT/i,
  /other side closed/i,
  /socket hang up/i,
  /fetch failed/i,
  /^terminated$/i, // undici's generic message when a connection is dropped mid-request
];

/**
 * Whether `error` (or anything in its `.cause` chain) looks like a
 * transient network failure rather than an application-level error (auth,
 * 404, validation, etc.) that would just fail again identically.
 */
export function isTransientNetworkError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth++) {
    if (!(current instanceof Error)) {
      break;
    }
    const code = (current as NodeJS.ErrnoException).code;
    const haystack = `${current.message} ${code ?? ""}`;
    if (TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(haystack))) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Retries `fn` with exponential backoff, but only when the thrown error
 * looks transient (see {@link isTransientNetworkError}). Application-level
 * errors (thrown synchronously or returned as `{ error }` by openapi-fetch)
 * are never retried — they would just fail again identically.
 */
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === attempts;
      if (isLastAttempt || !isTransientNetworkError(error)) {
        throw error;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[Sandock] Transient network error (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms:`,
        error instanceof Error ? error.message : error,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // Unreachable: the loop always returns or throws.
  throw new Error("withNetworkRetry: exhausted attempts without a result");
}
