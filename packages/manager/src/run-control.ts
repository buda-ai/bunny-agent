/**
 * Wire types for the live Pi steering control channel.
 *
 * `RunControl` is attached by the caller to a coding-run request so the
 * daemon can later accept out-of-band `/api/coding/control` requests
 * (capabilities/steer/status) scoped to that exact run. The control token is
 * caller-generated (never issued by the daemon) and must carry at least 32
 * bytes of entropy before encoding (e.g. `crypto.randomBytes(32)`).
 */
export interface RunControl {
  version: 1;
  /** Caller-generated unique identifier for this run. Must be unique per daemon process/journal. */
  runId: string;
  /** Caller-generated secret, compared with constant-time equality by the daemon. Never echoed back. */
  token: string;
}

/** A single message a caller wants delivered to the live run via steering. */
export interface RunControlMessage {
  /** Caller-chosen stable ID. Re-sending the same ID with the same payload returns the original receipt. */
  id: string;
  text: string;
  images?: Array<{ data: string; mimeType: string }>;
}

export type RunControlOperation = "capabilities" | "steer" | "status";

/** Body for `POST /api/coding/control`. */
export interface RunControlRequestBody {
  version: 1;
  operation: RunControlOperation;
  /** Required for "steer" and "status"; omitted for the generic "capabilities" probe. */
  runId?: string;
  /** Required for "steer" and "status"; omitted for the generic "capabilities" probe. */
  token?: string;
  /** Required for "steer". */
  message?: RunControlMessage;
}

/**
 * Lifecycle of a single steer message, tracked by caller-chosen `id`.
 *
 * - "accepted": the daemon durably recorded intent to deliver it and will
 *   attempt native delivery; this is distinct from the model having seen it.
 * - "consumed": the runner observed the exact native message object it
 *   queued for this id — identified by a provider-bound correlation marker
 *   (a per-controller nonce plus this stable id) carried as ordinary
 *   metadata on that message, not by text matching or queue-length deltas —
 *   inside the final context handed to the model-facing provider call.
 * - "handled": an input handler (extension/skill expansion) intercepted the
 *   text before it ever became a native queued message; it will never
 *   produce a "consumed" transition.
 * - "rejected": the daemon declined to accept it (bad run state, duplicate
 *   id with a different payload, validation failure).
 * - "uncertain": the daemon cannot determine the outcome (e.g. process
 *   restarted after dispatch, or the native call's result is ambiguous).
 */
export type RunControlReceiptState =
  | "accepted"
  | "consumed"
  | "handled"
  | "rejected"
  | "uncertain";

export interface RunControlReceipt {
  id: string;
  state: RunControlReceiptState;
  /** Present only for "rejected" receipts. */
  reason?: string;
  /** ms since epoch the receipt was last updated. */
  updatedAt: number;
}

export interface RunControlCapabilities {
  version: 1;
  /** True when this daemon build understands the live Pi steering control channel. */
  supportedPiSteer: boolean;
}

export interface RunControlStatus {
  active: boolean;
  /** Monotonically increasing counter bumped every time the live handle changes (register/unregister/restart). */
  epoch: number;
  receipts: RunControlReceipt[];
}

/**
 * Outcome of a single native steer attempt, reported by a runner's live
 * controller back to the daemon's control registry.
 *
 * - "queued": the runner's native queue accepted the message and will
 *   report consumption asynchronously via a later `onConsumed` callback.
 * - "handled": the runner intercepted/consumed the text immediately (e.g.
 *   an input handler), so no "consumed" transition will ever follow.
 * - "rejected": the runner's live session cannot accept steering right now
 *   (not ready, already disposed, etc).
 */
export type LiveSteerDisposition = "queued" | "handled" | "rejected";

export interface LiveSteerResult {
  disposition: LiveSteerDisposition;
  /** Present only when disposition is "rejected". */
  reason?: string;
}

/**
 * Runner-agnostic live controller a runner registers with its host (the
 * daemon's control registry) once its underlying agent session exists and
 * is ready to accept mid-run input — i.e. after the first real provider-call
 * boundary of the run, never before.
 *
 * Implementations own correlating a dispatched message back to its
 * runner-native representation (e.g. a provider-bound correlation marker
 * carried as ordinary message metadata, not text matching or queue-length
 * deltas) and must report consumption through `onConsumed` without the host
 * needing to know runner-specific event shapes.
 */
export interface LiveRunController {
  /**
   * Attempt to steer the live run with `message` at the next safe
   * tool/turn boundary. Must not await native consumption — return as soon
   * as the message has been durably handed to the runner's native queue (or
   * synchronously handled/rejected).
   */
  steer(message: RunControlMessage): Promise<LiveSteerResult>;
  /**
   * Register a callback the controller invokes exactly once per message id
   * once the runner observes that message in the final context handed to
   * the model-facing provider call (i.e. the model has seen it). Hosts call
   * this once per registered controller.
   */
  onConsumed(callback: (id: string) => void): void;
  /** Release any resources/listeners. Does not touch the underlying agent session's lifecycle. */
  dispose(): void;
}

/**
 * Host-side hook a runner calls once its live session exists and is ready
 * to accept steering (after the first real provider-call boundary of the
 * run). Passed through `RunnerCoreOptions.liveControl`; only the `pi` runner
 * currently invokes it.
 */
export type RegisterLiveRunController = (controller: LiveRunController) => void;
