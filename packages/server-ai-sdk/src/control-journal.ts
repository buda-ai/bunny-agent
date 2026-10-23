/**
 * Durable per-run journal for the live steering control channel.
 *
 * One directory (`stateDir`) holds one subdirectory per run, named by a
 * hash of the runId (never the raw caller-chosen runId, which could embed
 * unexpected characters or be used to probe the filesystem). Each run
 * directory holds:
 *
 *   - `owner.json` — written exactly once, atomically, at `claimRun` time:
 *     `{ tokenDigest, pid, nonce, claimedAt, closed }`. The raw token is
 *     never persisted — only a SHA-256 digest, checked with a constant-time
 *     comparison against the digest of a presented token. This file acts as
 *     both the fencing lock (its existence claims the runId for this state
 *     directory) and the durable answer to "what token guards this run's
 *     status" after the in-memory registry has forgotten about it (process
 *     restart, or a different daemon process sharing the dir).
 *   - `receipts/<hash(id)>.json` — one file per steer-message receipt.
 *
 * Fencing: `claimRun` uses `open(..., "wx")` (O_CREAT|O_EXCL) to atomically
 * create the *complete* `owner.json` record in one write — there is no
 * intermediate empty-token state another reader could observe. The OS
 * guarantees only one process ever wins that create, so two daemon
 * processes sharing a state directory can never both register the same
 * runId. There is no automatic "dead owner" reclaim: PID reuse makes
 * liveness checks unreliable, and reclaiming a live owner's run out from
 * under it risks double delivery to the native controller, which is
 * strictly worse than a runId staying unavailable until the directory is
 * cleaned up out-of-band. A crash leaves `owner.json` behind; restarting the
 * same runId is intentionally denied (per the "never reuse a runId" wire
 * contract) and existing receipts are retained so `getReceipt`/`listReceipts`
 * still answer correctly.
 *
 * Recovery scope: this journal never scans or mutates run directories it
 * does not currently hold the in-memory claim for. A process that never
 * owned a run in memory (fresh restart, or a different process) only ever
 * *reads* that run's receipts — `"accepted"` is presented to the caller as
 * `"uncertain"` in the returned value, without rewriting the file on disk.
 * This guarantees a still-live owner elsewhere is never clobbered by a
 * second process's recovery pass. Only the process that actually held the
 * run in memory may persist an `accepted -> uncertain` transition (via
 * {@link ControlJournal.releaseRun}), and the registry calls it under that
 * run's own serialized dispatch queue.
 *
 * All writes are tmp-file-then-rename so a reader never observes a partial
 * file, and happen after the in-memory per-run dispatch queue has already
 * serialized concurrent callers within this process.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { RunControlReceiptState } from "@bunny-agent/runner-harness";

export interface JournalReceipt {
  id: string;
  payloadHash: string;
  state: RunControlReceiptState;
  reason?: string;
  updatedAt: number;
}

interface OwnerRecord {
  /** SHA-256 hex digest of the caller's control token. The raw token is never persisted. */
  tokenDigest: string;
  pid: number;
  /** Per-claim random value; not security-sensitive, just disambiguates owner identity in diagnostics. */
  nonce: string;
  claimedAt: number;
  /** Set once the owning process has released (unregistered) this run. */
  closed: boolean;
}

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

function hashKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time digest comparison (both sides are fixed-length hex, so no length oracle). */
function digestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Reject a path component that is (or sits beneath) a symlink instead of a
 * real directory/file, so a pre-existing symlink planted at a predictable
 * hashed path can't redirect a write outside `stateDir`. Never deletes
 * anything — a caller hitting this throws and the run is treated as
 * unclaimable, which is strictly safer than clobbering whatever is there.
 */
async function assertNotSymlink(targetPath: string): Promise<void> {
  let stat: import("node:fs").Stats;
  try {
    stat = await fs.lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(
      `refusing to use "${targetPath}": existing symlink where a private file/directory was expected`,
    );
  }
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  await assertNotSymlink(filePath);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data), {
    mode: FILE_MODE,
    flag: "wx",
  });
  await fs.rename(tmpPath, filePath);
}

async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function defaultStateDir(): string {
  return path.join(os.homedir(), ".bunny", "agent", "run-control");
}

export class ControlJournal {
  constructor(private readonly stateDir: string) {}

  private runDir(runId: string): string {
    return path.join(this.stateDir, hashKey(runId));
  }

  private ownerPath(runId: string): string {
    return path.join(this.runDir(runId), "owner.json");
  }

  private receiptsDir(runId: string): string {
    return path.join(this.runDir(runId), "receipts");
  }

  private receiptPath(runId: string, id: string): string {
    return path.join(this.receiptsDir(runId), `${hashKey(id)}.json`);
  }

  /**
   * Create `dir` (and enforce `DIR_MODE` on it even if it pre-existed with
   * looser permissions — `mkdir`'s `mode` only applies on actual creation).
   * Refuses a pre-existing symlink at this path rather than following or
   * replacing it. Never deletes anything.
   */
  private async ensurePrivateDir(dir: string): Promise<void> {
    await assertNotSymlink(dir);
    await fs.mkdir(dir, { recursive: true, mode: DIR_MODE });
    await fs.chmod(dir, DIR_MODE);
  }

  /**
   * Fencing claim: atomically creates the *complete* owner record (token
   * digest included) in a single `wx` write — there is no intermediate
   * empty-token state. Fails if another process (or an earlier instance of
   * this one) already owns this runId, so duplicate/reused runIds are
   * rejected before any in-memory registration happens. The raw token is
   * never written to disk, logged, or embedded in error messages — only its
   * SHA-256 digest.
   */
  async claimRun(runId: string, token: string): Promise<void> {
    const dir = this.runDir(runId);
    await this.ensurePrivateDir(dir);
    await this.ensurePrivateDir(this.receiptsDir(runId));
    const record: OwnerRecord = {
      tokenDigest: sha256Hex(token),
      pid: process.pid,
      nonce: randomBytes(16).toString("hex"),
      claimedAt: Date.now(),
      closed: false,
    };
    const ownerPath = this.ownerPath(runId);
    await assertNotSymlink(ownerPath);
    try {
      const fd = await fs.open(ownerPath, "wx", FILE_MODE);
      try {
        await fd.writeFile(JSON.stringify(record));
      } finally {
        await fd.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(
          `runId is already owned (by this or another daemon process); runIds must never be reused`,
        );
      }
      throw error;
    }
  }

  /**
   * Release the fencing claim and any in-memory liveness this runId held.
   * Receipts are retained. Marks `owner.json.closed = true` so a foreign
   * reader never mistakes this run for still having a live in-memory
   * handle anywhere, and — under the caller's own serialized per-run
   * queue — persists any still-`"accepted"` receipt as `"uncertain"`: this
   * process legitimately owned the run and is the only one allowed to make
   * that write (a different process recovering this run later must never
   * write to it; see the module-level "Recovery scope" docs above).
   */
  async releaseRun(runId: string): Promise<void> {
    const ownerPath = this.ownerPath(runId);
    const existing = await readJsonIfExists<OwnerRecord>(ownerPath);
    if (existing) {
      await atomicWriteJson(ownerPath, { ...existing, closed: true });
    }
    const receipts = await this.listReceipts(runId);
    for (const receipt of receipts) {
      if (receipt.state === "accepted") {
        await atomicWriteJson(this.receiptPath(runId, receipt.id), {
          ...receipt,
          state: "uncertain" satisfies RunControlReceiptState,
          updatedAt: Date.now(),
        });
      }
    }
  }

  /**
   * Verify a caller-presented token against the stored digest with a
   * constant-time comparison. Returns `false` for an unclaimed runId (same
   * as a wrong token, to the caller).
   */
  async verifyOwnerToken(runId: string, token: string): Promise<boolean> {
    const record = await readJsonIfExists<OwnerRecord>(this.ownerPath(runId));
    if (!record) return false;
    return digestsEqual(record.tokenDigest, sha256Hex(token));
  }

  async putReceipt(runId: string, receipt: JournalReceipt): Promise<void> {
    await this.ensurePrivateDir(this.receiptsDir(runId));
    await atomicWriteJson(this.receiptPath(runId, receipt.id), receipt);
  }

  async getReceipt(
    runId: string,
    id: string,
  ): Promise<JournalReceipt | undefined> {
    return readJsonIfExists<JournalReceipt>(this.receiptPath(runId, id));
  }

  async listReceipts(runId: string): Promise<JournalReceipt[]> {
    const dir = this.receiptsDir(runId);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const receipts: JournalReceipt[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const receipt = await readJsonIfExists<JournalReceipt>(
        path.join(dir, entry),
      );
      if (receipt) receipts.push(receipt);
    }
    return receipts;
  }

  /**
   * Read-only recovery check: was this run's owner record left by *this*
   * process (same pid) and never closed? Used by {@link LiveRunRegistry} to
   * decide whether an `"accepted"` receipt it finds on disk for a runId it
   * doesn't currently hold in memory belongs to a crashed instance of this
   * same process (safe to treat as locally-recoverable) versus a run this
   * process genuinely never saw. Either way the registry only ever
   * *presents* `"uncertain"` for such receipts — this method never mutates
   * anything, so a still-live owner (same or different process) is never at
   * risk of having its journal rewritten out from under it.
   */
  async readOwnerRecord(
    runId: string,
  ): Promise<{ pid: number; closed: boolean } | undefined> {
    const record = await readJsonIfExists<OwnerRecord>(this.ownerPath(runId));
    if (!record) return undefined;
    return { pid: record.pid, closed: record.closed };
  }
}

/**
 * Create a journal rooted at `stateDir` (or
 * `BUNNY_CODING_CONTROL_STATE_DIR`, or a private default under the host
 * home directory). Restrictive permissions (`0700` dirs / `0600` files) are
 * applied on every write. Throws if the directory cannot be created/used at
 * all (e.g. read-only home) — {@link LiveRunRegistry} is the layer that
 * catches this and degrades to "no durable control available" rather than a
 * silent in-memory success path.
 */
export async function createControlJournal(
  stateDir: string | undefined,
): Promise<ControlJournal> {
  const resolved =
    stateDir ?? process.env.BUNNY_CODING_CONTROL_STATE_DIR ?? defaultStateDir();
  await assertNotSymlink(resolved);
  await fs.mkdir(resolved, { recursive: true, mode: DIR_MODE });
  // mkdir with mode only applies to newly-created directories; enforce it
  // explicitly in case the directory pre-existed with looser permissions.
  await fs.chmod(resolved, DIR_MODE);
  return new ControlJournal(resolved);
}
