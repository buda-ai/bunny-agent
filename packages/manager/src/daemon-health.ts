import type { ExecOptions, SandboxHandle } from "./types.js";

const HEALTHZ_PATH = "/healthz";

function daemonHealthzUrl(daemonBaseUrl: string): string {
  const normalized = daemonBaseUrl.replace(/\/$/, "");
  const withoutHealthz = normalized.replace(/\/healthz$/i, "");
  return `${withoutHealthz}${HEALTHZ_PATH}`;
}

/**
 * Hard cap on bytes collected from `handle.exec`'s stdout. The curl invocation
 * here only ever prints a short status code (e.g. `"200"`), so a well-behaved
 * exec produces a handful of bytes — this cap only guards against a
 * misbehaving/adversarial adapter streaming unbounded output and growing this
 * buffer without limit.
 */
const MAX_COLLECTED_BYTES = 4096;

async function collectExecUtf8(
  iterable: AsyncIterable<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  let collectedBytes = 0;
  for await (const chunk of iterable) {
    collectedBytes += chunk.byteLength;
    if (collectedBytes > MAX_COLLECTED_BYTES) break;
    out += decoder.decode(chunk, { stream: true });
  }
  out += decoder.decode();
  return out;
}

/**
 * Closed set of per-attempt failure classifications, for diagnostics only.
 * Never exposed as a new success state — every non-`ok` value still resolves
 * the attempt (and therefore the probe) to boolean `false`.
 */
export type DaemonHealthAttemptReason =
  | "ok"
  | "http-non-200"
  | "transport-error"
  | "probe-timeout";

/** Diagnostic record for a single probe attempt, passed to `onAttempt`. */
export interface DaemonHealthAttemptInfo {
  /** 1-based attempt number within this `isBunnyAgentDaemonHealthy` call. */
  attempt: number;
  /** Wall-clock latency of this attempt, in milliseconds. */
  latencyMs: number;
  reason: DaemonHealthAttemptReason;
  /** True only when `reason === "ok"`. */
  healthy: boolean;
}

export type IsBunnyAgentDaemonHealthyOptions = ExecOptions & {
  /** Default 1 — avoid retry storms on every SDK stream. */
  maxAttempts?: number;
  /** Delay between attempts (default 0). */
  delayMs?: number;
  /**
   * Diagnostic hook invoked after every attempt settles (success or not).
   * Not part of the success/failure contract — purely for the caller's own
   * logging. Must not throw; thrown errors are swallowed so a logging bug
   * can never affect probe behavior.
   */
  onAttempt?: (info: DaemonHealthAttemptInfo) => void;
};

/** Default exec + curl wall clock for one health probe (ms). */
const DEFAULT_DAEMON_HEALTH_TIMEOUT_MS = 4000;

function monotonicNowMs(): number {
  return Number(process.hrtime.bigint() / 1_000_000n);
}

function reportAttempt(
  onAttempt: ((info: DaemonHealthAttemptInfo) => void) | undefined,
  info: DaemonHealthAttemptInfo,
): void {
  if (!onAttempt) return;
  try {
    onAttempt(info);
  } catch {
    // Diagnostics must never affect probe behavior.
  }
}

/**
 * Runs one `curl` attempt against `<base>/healthz` inside the sandbox, bounded by
 * `timeoutMs` on the CALLER's side — a promise-level wait bound, not a guarantee
 * the underlying `handle.exec` call actually terminates. On timeout, an
 * `AbortController` is aborted and passed through `ExecOptions.signal` so
 * adapters that honor `AbortSignal` actually stop the underlying command;
 * adapters that don't are left running (same as before this change), but the
 * attempt itself always settles at or shortly after `timeoutMs`.
 *
 * Returns both the boolean outcome and the attempt's failure classification,
 * plus (when it timed out) the still-pending inner exec promise so the caller
 * can track it instead of treating an unconfirmed attempt as safe to retry.
 */
async function runOneAttempt(
  handle: SandboxHandle,
  healthzUrl: string,
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  env: Record<string, string> | undefined,
): Promise<{
  healthy: boolean;
  reason: DaemonHealthAttemptReason;
  /** Present only when this attempt timed out without the inner exec settling. */
  pending?: Promise<unknown>;
}> {
  const maxTimeSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  const connectTimeoutSec = Math.min(maxTimeSec, 5);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  if (signal?.aborted) controller.abort();

  let innerSettled = false;

  const innerPromise = (async (): Promise<{
    healthy: boolean;
    reason: DaemonHealthAttemptReason;
  }> => {
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
            timeout: timeoutMs,
            signal: controller.signal,
            env,
          },
        ),
      );
      if (text.trim() === "200") {
        return { healthy: true, reason: "ok" };
      }
      return { healthy: false, reason: "http-non-200" };
    } catch {
      // Connection failure, spawn error, abort, etc. An abort triggered by
      // our own timeout is reported as probe-timeout below, not here — this
      // branch's classification only matters when it wins the race.
      return { healthy: false, reason: "transport-error" };
    } finally {
      innerSettled = true;
    }
  })();

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([innerPromise, timeoutPromise]);
    if (result === "timeout") {
      // Lost the race to our own timeout. innerSettled is checked (not
      // assumed) because `controller.abort()` above can let the inner exec
      // reject synchronously-enough to settle in the same microtask batch —
      // in that case report its real outcome instead of a spurious timeout.
      if (innerSettled) return await innerPromise;
      // Attach a no-op consumer so this never becomes an unhandled
      // rejection, and hand the still-pending promise back to the caller so
      // it can track the outstanding attempt instead of assuming it's done.
      innerPromise.catch(() => {});
      return { healthy: false, reason: "probe-timeout", pending: innerPromise };
    }
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Runs `curl` against `<base>/healthz` inside the sandbox via the handle's `exec` method.
 * Returns true only when the HTTP status line is **200** (`-w '%{http_code}'`).
 *
 * Defaults: **one attempt**, **~4s** budget, and curl `--connect-timeout` / `--max-time` so the
 * command cannot hang much longer than `timeout` even if the adapter is loose. Each attempt is
 * additionally bounded by its own `AbortController`-backed race (see `runOneAttempt`) so a
 * sandbox adapter that does not honor `exec`'s `timeout`/`signal` options cannot stall this
 * promise past `timeout` — though the underlying exec call itself may keep running; this is a
 * promise-level wait bound, not a guarantee of the exec's actual lifetime.
 */
function finiteOr<T extends number>(value: T | undefined, fallback: T): T {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Hard clamp on attempts so a caller-supplied value can't build an unbounded total deadline. */
const MAX_ATTEMPTS_CAP = 100;

/**
 * Cross-call outstanding-exec tracker, keyed by `SandboxHandle` instance then
 * normalized `/healthz` URL. A single `isBunnyAgentDaemonHealthy` call already
 * refuses to start attempt N+1 while attempt N's exec is unconfirmed (see the
 * `outstanding` local below) — this map extends that same no-overlapping-exec
 * rule across SEPARATE calls: if call A's last attempt timed out without
 * confirmed settlement and returned `false`, a subsequent call B for the same
 * handle+endpoint must not start a brand new exec while A's is still
 * potentially running in the sandbox. The `WeakMap` on `SandboxHandle` means
 * entries for a garbage-collected handle are reclaimed automatically; the
 * inner `Map` is capped so an adapter that churns through many distinct
 * endpoint strings for one handle can't grow it without bound.
 */
const MAX_TRACKED_ENDPOINTS_PER_HANDLE = 50;
const crossCallOutstanding = new WeakMap<
  SandboxHandle,
  Map<string, Promise<unknown>>
>();

function takeCrossCallOutstanding(
  handle: SandboxHandle,
  url: string,
): Promise<unknown> | null {
  return crossCallOutstanding.get(handle)?.get(url) ?? null;
}

function setCrossCallOutstanding(
  handle: SandboxHandle,
  url: string,
  p: Promise<unknown>,
): void {
  let byUrl = crossCallOutstanding.get(handle);
  if (!byUrl) {
    byUrl = new Map();
    crossCallOutstanding.set(handle, byUrl);
  }
  // Never evict an unconfirmed operation: doing so would permit a duplicate
  // exec for its endpoint. New endpoints are refused at capacity before exec.
  byUrl.set(url, p);
  p.then(
    () => clearCrossCallOutstanding(handle, url, p),
    () => clearCrossCallOutstanding(handle, url, p),
  );
}

function clearCrossCallOutstanding(
  handle: SandboxHandle,
  url: string,
  expected: Promise<unknown>,
): void {
  const byUrl = crossCallOutstanding.get(handle);
  if (!byUrl) return;
  // Only clear if this is still the entry we set — a newer call may have
  // already replaced it (shouldn't happen given the fail-closed check below,
  // but guards against a stale callback mutating a successor's entry).
  if (byUrl.get(url) === expected) byUrl.delete(url);
}

export async function isBunnyAgentDaemonHealthy(
  handle: SandboxHandle,
  daemonBaseUrl: string,
  opts?: IsBunnyAgentDaemonHealthyOptions,
): Promise<boolean> {
  const healthzUrl = daemonHealthzUrl(daemonBaseUrl);
  const maxAttempts = Math.min(
    MAX_ATTEMPTS_CAP,
    Math.max(1, Math.trunc(finiteOr(opts?.maxAttempts, 1))),
  );
  const delayMs = Math.max(0, finiteOr(opts?.delayMs, 0));
  const timeout = Math.min(
    30_000,
    Math.max(500, finiteOr(opts?.timeout, DEFAULT_DAEMON_HEALTH_TIMEOUT_MS)),
  );
  const cwd = opts?.cwd ?? handle.getWorkdir();

  // This call's own total deadline — computed once, up front, from the
  // worst-case schedule (every attempt using its full timeout, every
  // inter-attempt delay elapsing in full). Bounds the whole call, including
  // time spent waiting on a prior attempt's unconfirmed exec, so a
  // non-cooperating adapter can stall at most one call's worth of time
  // instead of accumulating unbounded waits across retries.
  const totalDeadlineAt =
    monotonicNowMs() +
    timeout * maxAttempts +
    delayMs * Math.max(0, maxAttempts - 1);
  const remainingBudgetMs = () =>
    Math.max(0, totalDeadlineAt - monotonicNowMs());

  // Pre-aborted callers must never start a new exec at all — not even the
  // first attempt. A signal that is already aborted when we're called means
  // the caller has already given up on this probe.
  if (opts?.signal?.aborted) return false;

  // A previous, separate call to this function for the same handle+endpoint
  // left its last attempt unconfirmed. Starting a brand new exec here would
  // overlap it in the sandbox — fail closed for this call instead (same
  // no-overlapping-exec rule as the in-call `outstanding` tracker below, just
  // extended across calls).
  const crossCallPrior = takeCrossCallOutstanding(handle, healthzUrl);
  if (crossCallPrior) return false;
  if (
    (crossCallOutstanding.get(handle)?.size ?? 0) >=
    MAX_TRACKED_ENDPOINTS_PER_HANDLE
  ) {
    return false;
  }

  // A timed-out-but-unconfirmed attempt's inner exec promise. While this is
  // set, no new exec is issued for this call — issuing one would overlap a
  // still-potentially-running exec in the sandbox for the same identity
  // (the no-overlapping-exec rule). Registering it cross-call (below)
  // attaches a no-op consumer so it never becomes an unhandled rejection
  // even if this function returns before it settles.
  let outstanding: Promise<unknown> | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (outstanding) {
      // Bound the wait on the prior attempt's unconfirmed exec by the same
      // per-attempt timeout used for a fresh attempt — this function has no
      // wider deadline of its own to bound against (callers layering an
      // overall deadline on top, e.g. embedded-daemon.ts's poll loop, do
      // their own bounding via their own Deadline). Waiting forever here
      // would turn a single non-cooperating adapter into a hang instead of
      // the documented "resolves false at or shortly after timeout" contract.
      const outcome = await Promise.race([
        outstanding.then(() => "settled" as const),
        new Promise<"wait-expired">((r) =>
          setTimeout(
            () => r("wait-expired"),
            Math.min(timeout, remainingBudgetMs()),
          ),
        ),
      ]);
      if (outcome === "wait-expired") {
        // The prior exec STILL hasn't confirmed settlement. Starting a new
        // exec here would violate the no-overlapping-exec rule — the whole
        // point of tracking `outstanding` across iterations. Give up for
        // this call instead of launching a duplicate, registering it in the
        // cross-call map so a subsequent SEPARATE call also waits.
        setCrossCallOutstanding(handle, healthzUrl, outstanding);
        return false;
      }
      outstanding = null;
    }

    if (remainingBudgetMs() <= 0) break;

    const attemptStart = monotonicNowMs();
    const { healthy, reason, pending } = await runOneAttempt(
      handle,
      healthzUrl,
      cwd,
      Math.min(timeout, remainingBudgetMs()),
      opts?.signal,
      opts?.env,
    );
    reportAttempt(opts?.onAttempt, {
      attempt,
      latencyMs: monotonicNowMs() - attemptStart,
      reason,
      healthy,
    });
    if (healthy) return true;
    if (pending) {
      // This attempt timed out without confirmed settlement. Do not start
      // attempt N+1's exec until it resolves (checked at the top of the next
      // loop iteration) — even if that means skipping the inter-attempt delay.
      outstanding = pending;
      continue;
    }
    if (attempt < maxAttempts && delayMs > 0) {
      await new Promise((r) =>
        setTimeout(r, Math.min(delayMs, remainingBudgetMs())),
      );
    }
  }

  // Never block the final return on an outstanding attempt that may never
  // settle — register it cross-call (so a subsequent SEPARATE call for this
  // handle+endpoint also refuses to overlap it) and consume it quietly in
  // the background.
  if (outstanding) setCrossCallOutstanding(handle, healthzUrl, outstanding);
  return false;
}
