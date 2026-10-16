/**
 * Host-side registry for the live Pi steering control channel (PUL-355).
 *
 * One `LiveRunRegistry` instance is shared between the `/api/coding/run`
 * stream and the `/api/coding/control` route so a control request always
 * sees the same in-memory map of active runs the run route just populated —
 * see {@link createAiSdkCodingServers}. Durable receipt state additionally
 * persists to a journal directory so a process restart can report
 * "uncertain" instead of silently losing track of in-flight steer intents.
 *
 * Lifecycle: `registerRun` is called before the model starts (so a
 * malformed/duplicate `control.runId` fails the request before any provider
 * call), with `ready=false` until the runner's native controller calls
 * `markReady`. `unregisterRun` always runs in the caller's `finally` block
 * (abort, error, or normal stream end) — after that, the run is no longer
 * "active" but its receipts remain queryable until the registry is
 * recycled (process restart).
 */

import { timingSafeEqual } from "node:crypto";
import type {
  LiveRunController,
  RunControlMessage,
  RunControlReceipt,
  RunControlReceiptState,
} from "@bunny-agent/runner-harness";
import {
  type ControlJournal,
  createControlJournal,
  type JournalReceipt,
} from "./control-journal.js";

export type ControlErrorCode =
  | "not_found" // unknown runId OR wrong token — identical wire response
  | "not_ready" // run registered but native controller hasn't called markReady yet
  | "closed" // run unregistered (ended) — status still answerable, steer is not
  | "unsupported" // run registered without a live controller (non-pi runner)
  | "malformed" // request body failed validation
  | "conflict"; // duplicate id with a different payload

export class ControlError extends Error {
  constructor(
    public readonly code: ControlErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface RunProfile {
  runner: string;
  model: string;
}

interface ActiveRun {
  runId: string;
  token: string;
  ready: boolean;
  epoch: number;
  controller: LiveRunController | undefined;
  /**
   * Whether the selected runner for this run is capable of live steering at
   * all (currently: `runner === "pi"`). Known at registration time, before
   * the model starts — distinguishes a definite `unsupported` (this runner
   * will never call `markReady`) from a transient `not_ready` (it will, but
   * hasn't yet).
   */
  supportsLiveControl: boolean;
  /** Caller-chosen message id -> canonical payload hash, for idempotency checks. */
  dispatched: Map<string, string>;
  /** The run's configured runner/model, surfaced on authenticated status/capabilities. */
  profile: RunProfile | undefined;
  /**
   * True once `unregisterRun` has run. Unlike the old implementation, the
   * run entry stays in `this.runs` after closing (rather than being
   * deleted) so `steer`/`getStatus` can still validate the token and
   * idempotently reconcile a retried same-id/same-payload steer without
   * falling through to the generic "unknown run" 404.
   */
  closed: boolean;
}

const MAX_MESSAGE_TEXT_BYTES = 64 * 1024;
const MAX_MESSAGE_IMAGES = 8;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ID_LENGTH = 200;
const MAX_RUN_ID_LENGTH = 200;

/**
 * Minimum encoded length of a control token: 32 random bytes, base64url
 * (no padding) encoded, is 43 characters (`ceil(32*8/6)`). Matches the
 * `RunControl.token` contract documented in
 * `packages/manager/src/run-control.ts` ("at least 32 bytes of entropy
 * before encoding"). Charset is restricted to base64url
 * (`[A-Za-z0-9_-]`) — not because other charsets are inherently unsafe, but
 * because the daemon doesn't know what encoding the caller used, and a
 * fixed, checkable encoding is the only way to approximate "this has
 * plausible entropy" without trying to measure entropy directly.
 */
const MIN_TOKEN_LENGTH = 43;
const TOKEN_CHARSET_RE = /^[A-Za-z0-9_-]+$/;

/** True iff `token` plausibly carries >=32 bytes of entropy in base64url encoding. */
function isWellFormedToken(token: string): boolean {
  return token.length >= MIN_TOKEN_LENGTH && TOKEN_CHARSET_RE.test(token);
}

function canonicalPayloadString(message: RunControlMessage): string {
  // Order-independent, whitespace-independent canonical form so retrying the
  // exact same logical message never 409s on incidental JSON key order.
  const images = (message.images ?? []).map((image) => ({
    data: image.data,
    mimeType: image.mimeType,
  }));
  return JSON.stringify({ text: message.text, images });
}

async function sha256Hex(input: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Constant-time string compare (equal-length requirement enforced first, non-constant-time length check is fine since lengths aren't secret). */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function validateRunControlMessage(message: unknown): RunControlMessage {
  if (typeof message !== "object" || message === null) {
    throw new ControlError("malformed", "message is required");
  }
  const m = message as Record<string, unknown>;
  if (
    typeof m.id !== "string" ||
    m.id.length === 0 ||
    m.id.length > MAX_ID_LENGTH
  ) {
    throw new ControlError(
      "malformed",
      `message.id must be a non-empty string up to ${MAX_ID_LENGTH} chars`,
    );
  }
  if (typeof m.text !== "string") {
    throw new ControlError("malformed", "message.text must be a string");
  }
  if (Buffer.byteLength(m.text, "utf8") > MAX_MESSAGE_TEXT_BYTES) {
    throw new ControlError(
      "malformed",
      `message.text exceeds ${MAX_MESSAGE_TEXT_BYTES} bytes`,
    );
  }
  let images: RunControlMessage["images"];
  if (m.images !== undefined) {
    if (!Array.isArray(m.images)) {
      throw new ControlError("malformed", "message.images must be an array");
    }
    if (m.images.length > MAX_MESSAGE_IMAGES) {
      throw new ControlError(
        "malformed",
        `message.images exceeds ${MAX_MESSAGE_IMAGES} entries`,
      );
    }
    images = m.images.map((raw, idx) => {
      if (typeof raw !== "object" || raw === null) {
        throw new ControlError(
          "malformed",
          `message.images[${idx}] is invalid`,
        );
      }
      const img = raw as Record<string, unknown>;
      if (typeof img.data !== "string" || typeof img.mimeType !== "string") {
        throw new ControlError(
          "malformed",
          `message.images[${idx}] must have string data and mimeType`,
        );
      }
      if (Buffer.byteLength(img.data, "utf8") > MAX_IMAGE_BYTES) {
        throw new ControlError(
          "malformed",
          `message.images[${idx}].data exceeds ${MAX_IMAGE_BYTES} bytes`,
        );
      }
      return { data: img.data, mimeType: img.mimeType };
    });
  }
  return { id: m.id, text: m.text, images };
}

export interface LiveRunRegistryOptions {
  /**
   * Directory for the durable control journal. When omitted, falls back to
   * `BUNNY_CODING_CONTROL_STATE_DIR`, then a private default under the host
   * home directory. Pass `null` explicitly to disable durability entirely
   * — not just "memory-only receipts", but *no controlled runs at all*:
   * `registerRun` fails closed with `ControlError("unsupported")` for any
   * run that requests a control channel, and the generic `capabilities`
   * probe reports `supportedPiSteer: false`. A registry with no durable
   * journal cannot safely fence a runId across a restart/crash, so it must
   * never pretend to support live steering. Uncontrolled runs (no
   * `control` block on the request) are completely unaffected either way.
   */
  stateDir?: string | null;
}

/**
 * Registers active runs and durably tracks steer-message receipts.
 *
 * Concurrency: all operations that touch a given run's receipt map await the
 * run's own serialized dispatch queue, so two steer calls for the same run
 * never race the native controller or the journal. Different runs dispatch
 * fully in parallel.
 */
export class LiveRunRegistry {
  private readonly runs = new Map<string, ActiveRun>();
  private readonly dispatchQueues = new Map<string, Promise<unknown>>();
  private journal: ControlJournal | null = null;
  private journalInit: Promise<ControlJournal | null> | null = null;
  private readonly stateDirOption: string | null | undefined;

  constructor(options: LiveRunRegistryOptions = {}) {
    this.stateDirOption = options.stateDir;
  }

  private async getJournal(): Promise<ControlJournal | null> {
    if (this.stateDirOption === null) return null;
    if (this.journalInit) return this.journalInit;
    this.journalInit = createControlJournal(this.stateDirOption).catch(
      (error) => {
        console.error(
          `[bunny-agent] live-run-control journal unavailable, durable receipts disabled: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      },
    );
    this.journal = await this.journalInit;
    return this.journal;
  }

  /** Whether this registry instance can persist receipts across a restart. */
  async supportsDurableControl(): Promise<boolean> {
    return (await this.getJournal()) !== null;
  }

  /**
   * Register a run before the model starts. Fails fast (before any provider
   * call) on a duplicate/reused runId, a malformed token, or (when `control`
   * was requested) an unavailable durable journal, so a bad/undurable
   * control request never produces a 200 stream that errors out later.
   *
   * Durability is mandatory for a *controlled* run: a run registered without
   * a journal to durably fence it could double-register across a crash/
   * restart race, or silently lose receipts a caller already got a 200 for.
   * `stateDir: null` (explicit opt-out) and a real journal init failure are
   * therefore treated identically here — both fail registration closed with
   * `unsupported` — never a silent memory-only "success".
   */
  async registerRun(
    runId: string,
    token: string,
    supportsLiveControl: boolean,
    profile?: RunProfile,
  ): Promise<void> {
    if (runId.length === 0 || runId.length > MAX_RUN_ID_LENGTH) {
      throw new ControlError(
        "malformed",
        `runId must be a non-empty string up to ${MAX_RUN_ID_LENGTH} chars`,
      );
    }
    if (!isWellFormedToken(token)) {
      throw new ControlError(
        "malformed",
        `token must be a base64url string of at least ${MIN_TOKEN_LENGTH} characters (>=32 random bytes)`,
      );
    }
    if (this.runs.has(runId)) {
      throw new ControlError(
        "conflict",
        `runId "${runId}" is already registered`,
      );
    }
    const journal = await this.getJournal();
    if (!journal) {
      throw new ControlError(
        "unsupported",
        "durable control journal is unavailable; controlled runs are not supported",
      );
    }
    // Fencing: claim exclusive ownership of this runId (owner record,
    // including the token digest, written atomically in one step) in the
    // durable journal before admitting it in-memory, so a second daemon
    // process sharing the same state directory can never register (and
    // dispatch to) the same runId concurrently. Also rejects reuse of a
    // runId that previously existed (even after this process's own
    // restart).
    try {
      await journal.claimRun(runId, token);
    } catch (error) {
      throw new ControlError(
        "conflict",
        error instanceof Error ? error.message : String(error),
      );
    }
    this.runs.set(runId, {
      runId,
      token,
      ready: false,
      epoch: 1,
      controller: undefined,
      supportsLiveControl,
      dispatched: new Map(),
      profile,
      closed: false,
    });
  }

  /** Native controller hook: run's live session now exists and can accept steering. */
  markReady(runId: string, controller: LiveRunController): void {
    const run = this.runs.get(runId);
    if (!run || run.closed) return;
    run.ready = true;
    run.controller = controller;
    run.epoch += 1;
    controller.onConsumed((id) => {
      void this.recordTransition(runId, id, "consumed").catch(() => {
        // A receipt write failure cannot make the native dispatch safe to
        // repeat. Keep the durable intent for conservative reconciliation.
        console.warn("[bunny-agent] failed to persist a consumption receipt");
      });
    });
  }

  /**
   * Always called in the run's `finally` block (abort, error, or normal end).
   * Leaves receipts queryable via `getStatus` but marks the run inactive so
   * further `steer` calls either idempotently reconcile (same id/payload) or
   * 409 `closed` — never reach a disposed controller. Serialized under the
   * run's own dispatch queue so an unregister racing an in-flight steer
   * settles deterministically (see {@link withRunQueue}).
   */
  async unregisterRun(runId: string): Promise<void> {
    await this.withRunQueue(runId, async () => {
      const run = this.runs.get(runId);
      if (!run) return;
      run.controller = undefined;
      run.ready = false;
      run.epoch += 1;
      run.closed = true;
      const journal = await this.getJournal();
      // Any receipt still "accepted" at unregister time (dispatched to the
      // native controller but never confirmed consumed/handled/rejected)
      // can no longer resolve — the controller is gone. This process
      // legitimately owned the run, so it's the only one allowed to persist
      // that as "uncertain" (never a resend, never a silent "accepted").
      if (journal) await journal.releaseRun(runId);
    });
  }

  private requireRun(
    runId: string | undefined,
    token: string | undefined,
  ): ActiveRun {
    if (!runId || !token) {
      throw new ControlError("malformed", "runId and token are required");
    }
    const run = this.runs.get(runId);
    // Unknown run and wrong token must be indistinguishable to the caller.
    if (!run || !constantTimeEqual(run.token, token)) {
      throw new ControlError("not_found", "no active run for this runId/token");
    }
    return run;
  }

  /** Serialize all dispatch for one run so concurrent same-id steers settle deterministically. */
  private async withRunQueue<T>(
    runId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prior = this.dispatchQueues.get(runId) ?? Promise.resolve();
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.dispatchQueues.set(
      runId,
      prior.then(() => gate),
    );
    await prior;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  async steer(
    runId: string | undefined,
    token: string | undefined,
    rawMessage: unknown,
  ): Promise<RunControlReceipt> {
    const message = validateRunControlMessage(rawMessage);
    if (!runId || !token) {
      throw new ControlError("malformed", "runId and token are required");
    }
    if (this.runs.has(runId)) {
      const run = this.requireRun(runId, token);
      return this.withRunQueue(run.runId, async () =>
        this.dispatchSteer(run, message),
      );
    }
    // A retry can arrive at a restarted daemon. Authenticate against the
    // retained owner record and reconcile only; no live handle is reconstructed.
    return this.withRunQueue(runId, async () => {
      const journal = await this.getJournal();
      if (!journal || !(await journal.verifyOwnerToken(runId, token))) {
        throw new ControlError(
          "not_found",
          "no active run for this runId/token",
        );
      }
      const existing = await journal.getReceipt(runId, message.id);
      if (!existing) {
        throw new ControlError(
          "closed",
          "run has ended and can no longer be steered",
        );
      }
      const hash = await sha256Hex(canonicalPayloadString(message));
      if (existing.payloadHash !== hash) {
        throw new ControlError(
          "conflict",
          "message id was already used with a different payload",
        );
      }
      return this.toWireReceipt(message.id, existing, true);
    });
  }

  private async dispatchSteer(
    run: ActiveRun,
    message: RunControlMessage,
  ): Promise<RunControlReceipt> {
    const journal = await this.getJournal();
    const payloadHash = await sha256Hex(canonicalPayloadString(message));
    const existingHash = run.dispatched.get(message.id);
    if (existingHash !== undefined) {
      if (existingHash !== payloadHash) {
        throw new ControlError(
          "conflict",
          `message id "${message.id}" was already used with a different payload`,
        );
      }
      // Same id + same canonical payload: pure reconcile, never re-dispatch
      // to the native controller — correct whether the run is still active
      // or has since closed (a retried idempotent steer after the run ended
      // must return the retained receipt, not re-validate run state).
      const existing = journal
        ? await journal.getReceipt(run.runId, message.id)
        : undefined;
      return this.toWireReceipt(message.id, existing);
    }

    // A genuinely new message id against a run that has already closed can
    // never be dispatched — the controller is gone — but the run did exist,
    // so this is a definite `closed` 409, distinct from `not_found`.
    if (run.closed) {
      throw new ControlError(
        "closed",
        "run has ended and can no longer be steered",
      );
    }

    if (!run.controller) {
      throw new ControlError(
        run.supportsLiveControl ? "not_ready" : "unsupported",
        run.supportsLiveControl
          ? "run is not ready to accept steering yet"
          : "run does not support live steering",
      );
    }

    // Durably record intent to dispatch BEFORE the native side-effect, so a
    // crash between journal write and native call is recoverable as
    // "uncertain" rather than silently lost.
    if (journal) {
      await journal.putReceipt(run.runId, {
        id: message.id,
        payloadHash,
        state: "accepted",
        updatedAt: Date.now(),
      });
    }
    run.dispatched.set(message.id, payloadHash);

    let nativeOutcomeState: RunControlReceiptState;
    let reason: string | undefined;
    try {
      const result = await run.controller.steer(message);
      if (result.disposition === "rejected") {
        nativeOutcomeState = "rejected";
        reason = result.reason;
      } else if (result.disposition === "handled") {
        nativeOutcomeState = "handled";
      } else {
        // "queued": stays "accepted" until the controller's onConsumed fires.
        nativeOutcomeState = "accepted";
      }
    } catch (error) {
      // The native call throwing mid-delivery is ambiguous — it may have
      // already reached the queue. Never claim a definite rejection here;
      // only an explicit `{disposition:"rejected"}` return does that.
      nativeOutcomeState = "uncertain";
      reason = error instanceof Error ? error.message : String(error);
    }

    const updatedAt = Date.now();
    if (journal) {
      // The write itself may fail (disk full, permission revoked mid-run,
      // etc). If it does, never let the caller believe the id is free to
      // resend: `dispatched` already recorded the payload hash above, so a
      // retry with the same id+payload takes the idempotent-replay path
      // (and finds no journal receipt, surfacing "uncertain" via
      // `toWireReceipt`'s undefined-receipt fallback) instead of racing a
      // second native dispatch.
      await journal.putReceipt(run.runId, {
        id: message.id,
        payloadHash,
        state: nativeOutcomeState,
        reason,
        updatedAt,
      });
    }
    return {
      id: message.id,
      state: nativeOutcomeState,
      ...(reason ? { reason } : {}),
      updatedAt,
    };
  }

  /** Callback-first consumption must never regress an already-terminal receipt. */
  private async recordTransition(
    runId: string,
    id: string,
    state: "consumed",
  ): Promise<void> {
    await this.withRunQueue(runId, async () => {
      const journal = await this.getJournal();
      if (!journal) return;
      const existing = await journal.getReceipt(runId, id);
      if (!existing) return; // unknown id — nothing to transition
      if (
        existing.state === "handled" ||
        existing.state === "rejected" ||
        existing.state === "consumed"
      ) {
        return; // terminal states never regress
      }
      await journal.putReceipt(runId, {
        ...existing,
        state,
        updatedAt: Date.now(),
      });
    });
  }

  /**
   * Map a raw journal receipt to the wire shape. An `"accepted"` receipt
   * read back for a run this process does not currently hold live in memory
   * (ended normally, crashed, or a different/restarted process) is
   * presented as `"uncertain"` — the outcome genuinely cannot be determined
   * without a live controller to ask, and this must never be mistaken for a
   * still-pending dispatch. This is purely a read-time presentation: it
   * never writes back to the journal (ownership of that write belongs only
   * to the process that held the run; see `control-journal.ts`'s "Recovery
   * scope" docs).
   */
  private toWireReceipt(
    id: string,
    receipt: JournalReceipt | undefined,
    presentAcceptedAsUncertain = false,
  ): RunControlReceipt {
    if (!receipt) {
      return { id, state: "uncertain", updatedAt: Date.now() };
    }
    const state =
      presentAcceptedAsUncertain && receipt.state === "accepted"
        ? ("uncertain" as const)
        : receipt.state;
    return {
      id: receipt.id,
      state,
      ...(receipt.reason ? { reason: receipt.reason } : {}),
      updatedAt: receipt.updatedAt,
    };
  }

  /**
   * Pure reconcile — never resends anything to the native controller. Safe to
   * call repeatedly, including after the run has ended (receipts stay
   * queryable) or for a run this process never saw if the journal has it
   * (e.g. after a restart).
   */
  async getStatus(
    runId: string | undefined,
    token: string | undefined,
  ): Promise<{
    active: boolean;
    ready: boolean;
    epoch: number;
    receipts: RunControlReceipt[];
    runner?: string;
    model?: string;
  }> {
    if (!runId || !token) {
      throw new ControlError("malformed", "runId and token are required");
    }
    const run = this.runs.get(runId);
    if (run) {
      if (!constantTimeEqual(run.token, token)) {
        throw new ControlError(
          "not_found",
          "no active run for this runId/token",
        );
      }
      const journal = await this.getJournal();
      const receipts = journal ? await journal.listReceipts(runId) : [];
      // `run.closed` means this process held the run and already released
      // it (its own queue already flipped accepted->uncertain durably), so
      // no additional read-time remapping is needed; `active` still
      // reflects the real in-memory liveness (false once closed).
      return {
        active: !run.closed,
        ready: run.ready,
        epoch: run.epoch,
        receipts: receipts.map((r) => this.toWireReceipt(r.id, r, run.closed)),
        ...(run.profile
          ? { runner: run.profile.runner, model: run.profile.model }
          : {}),
      };
    }
    // Run not active in this process — either it ended before this process
    // started (restart) or it belongs to a different daemon process
    // entirely. Answerable only from the journal, and only once the caller
    // proves the original token (checked against the stored digest with a
    // constant-time comparison — the raw token itself is never persisted).
    const journal = await this.getJournal();
    if (!journal) {
      throw new ControlError("not_found", "no active run for this runId/token");
    }
    const authorized = await journal.verifyOwnerToken(runId, token);
    if (!authorized) {
      throw new ControlError("not_found", "no active run for this runId/token");
    }
    const receipts = await journal.listReceipts(runId);
    // This process never held the run live, so it cannot know whether a
    // still-"accepted" receipt landed, is still in flight on a live owner
    // elsewhere, or was dropped by a crash — "uncertain" is the only honest
    // answer, and it is presented here read-only (the journal is never
    // rewritten for a run this process doesn't own; see
    // `control-journal.ts`'s "Recovery scope" docs).
    return {
      active: false,
      ready: false,
      epoch: 0,
      receipts: receipts.map((r) => this.toWireReceipt(r.id, r, true)),
    };
  }
}
