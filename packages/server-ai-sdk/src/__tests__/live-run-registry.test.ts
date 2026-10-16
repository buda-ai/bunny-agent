import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  LiveRunController,
  LiveSteerResult,
} from "@bunny-agent/runner-harness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControlJournal } from "../control-journal.js";
import { type ControlError, LiveRunRegistry } from "../live-run-registry.js";

/** Minimal in-memory fake standing in for `createPiLiveController`'s real native bridge. */
function fakeController(
  behavior: (message: {
    id: string;
  }) => LiveSteerResult | Promise<LiveSteerResult>,
) {
  let onConsumedCb: ((id: string) => void) | undefined;
  const controller: LiveRunController = {
    async steer(message) {
      return behavior(message);
    },
    onConsumed(cb) {
      onConsumedCb = cb;
    },
    dispose() {},
  };
  return {
    controller,
    emitConsumed: (id: string) => onConsumedCb?.(id),
  };
}

/** Valid control tokens for tests: >=32 random bytes, base64url, no padding (43+ chars). */
const TOK = "a".repeat(44);
const TOK_A = "a".repeat(43);
const TOK_B = "b".repeat(43);
const SECRET_TOK = "s".repeat(43);
const WRONG_TOK = "w".repeat(43);
const CORRECT_TOK = "c".repeat(43);

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "bunny-control-registry-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(stateDir, { recursive: true, force: true });
});

describe("LiveRunRegistry — token/runId validation", () => {
  it("rejects a token shorter than 32 random bytes (43 base64url chars)", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await expect(
      registry.registerRun("run-1", "short-token", true),
    ).rejects.toMatchObject({ code: "malformed" });
  });

  it("rejects a token outside the base64url charset", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await expect(
      registry.registerRun("run-1", `${"a".repeat(42)}+`, true),
    ).rejects.toMatchObject({ code: "malformed" });
  });

  it("accepts a token that is exactly 43 base64url characters", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await expect(
      registry.registerRun("run-1", TOK_A, true),
    ).resolves.toBeUndefined();
  });

  it("rejects an empty runId", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await expect(registry.registerRun("", TOK, true)).rejects.toMatchObject({
      code: "malformed",
    });
  });
});

describe("LiveRunRegistry — auth", () => {
  it("steer on an unknown runId 404s", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await expect(
      registry.steer("missing", TOK, { id: "m1", text: "hi" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("steer with the wrong token 404s identically to unknown run", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", CORRECT_TOK, true);
    let unknownErr: unknown;
    let wrongTokenErr: unknown;
    try {
      await registry.steer("nope", WRONG_TOK, { id: "m1", text: "hi" });
    } catch (e) {
      unknownErr = e;
    }
    try {
      await registry.steer("run-1", WRONG_TOK, { id: "m1", text: "hi" });
    } catch (e) {
      wrongTokenErr = e;
    }
    expect((unknownErr as ControlError).code).toBe("not_found");
    expect((wrongTokenErr as ControlError).code).toBe("not_found");
    expect((unknownErr as ControlError).code).toBe(
      (wrongTokenErr as ControlError).code,
    );
  });

  it("status requires runId and token", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await expect(
      registry.getStatus(undefined, undefined),
    ).rejects.toMatchObject({ code: "malformed" });
  });
});

describe("LiveRunRegistry — readiness / support", () => {
  it("steer before markReady is not_ready (409) for a pi-capable run", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    await expect(
      registry.steer("run-1", TOK, { id: "m1", text: "hi" }),
    ).rejects.toMatchObject({ code: "not_ready" });
  });

  it("steer on a non-pi (unsupported) run is 409 unsupported, never not_ready", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, false);
    await expect(
      registry.steer("run-1", TOK, { id: "m1", text: "hi" }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("steer with a brand-new id after unregisterRun (closed) is 409 closed, not 404", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const { controller } = fakeController(() => ({ disposition: "queued" }));
    registry.markReady("run-1", controller);
    await registry.unregisterRun("run-1");
    await expect(
      registry.steer("run-1", TOK, { id: "m1", text: "hi" }),
    ).rejects.toMatchObject({ code: "closed" });
  });

  it("steer with the wrong token on a closed run still 404s (never reveals closed vs unknown)", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    await registry.unregisterRun("run-1");
    await expect(
      registry.steer("run-1", WRONG_TOK, { id: "m1", text: "hi" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("status still answers for a closed run (receipts stay queryable)", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const { controller } = fakeController(() => ({ disposition: "queued" }));
    registry.markReady("run-1", controller);
    await registry.steer("run-1", TOK, { id: "m1", text: "hi" });
    await registry.unregisterRun("run-1");

    const status = await registry.getStatus("run-1", TOK);
    expect(status.active).toBe(false);
    expect(status.receipts).toHaveLength(1);
    // Unregister itself durably flips any still-"accepted" receipt to
    // "uncertain" under the run's own serialized queue — the controller is
    // gone, so "accepted" (implying it might still resolve) would be a lie.
    expect(status.receipts[0]).toMatchObject({ id: "m1", state: "uncertain" });
  });
});

describe("LiveRunRegistry — idempotent retry after close", () => {
  it("same id + same payload after the run ends returns the retained receipt without a native call", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    let callCount = 0;
    const { controller } = fakeController(() => {
      callCount += 1;
      return { disposition: "handled" };
    });
    registry.markReady("run-1", controller);

    const first = await registry.steer("run-1", TOK, {
      id: "m1",
      text: "hello",
    });
    await registry.unregisterRun("run-1");

    const second = await registry.steer("run-1", TOK, {
      id: "m1",
      text: "hello",
    });
    expect(callCount).toBe(1);
    expect(second).toEqual(first);
  });

  it("same id + different payload after the run ends is 409 conflict, never re-dispatched", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    let callCount = 0;
    const { controller } = fakeController(() => {
      callCount += 1;
      return { disposition: "handled" };
    });
    registry.markReady("run-1", controller);

    await registry.steer("run-1", TOK, { id: "m1", text: "hello" });
    await registry.unregisterRun("run-1");

    await expect(
      registry.steer("run-1", TOK, { id: "m1", text: "different" }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(callCount).toBe(1);
  });
});

describe("LiveRunRegistry — duplicate runIds", () => {
  it("rejects registering the same runId twice concurrently (only one wins)", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    const results = await Promise.allSettled([
      registry.registerRun("dup", TOK_A, true),
      registry.registerRun("dup", TOK_B, true),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});

describe("LiveRunRegistry — steer dispatch & idempotency", () => {
  it("queued disposition stays accepted until onConsumed fires", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const { controller, emitConsumed } = fakeController(() => ({
      disposition: "queued",
    }));
    registry.markReady("run-1", controller);

    const receipt = await registry.steer("run-1", TOK, {
      id: "m1",
      text: "hello",
    });
    expect(receipt.state).toBe("accepted");

    let status = await registry.getStatus("run-1", TOK);
    expect(status.receipts[0].state).toBe("accepted");

    emitConsumed("m1");
    // onConsumed's journal write is async (fire-and-forget from the
    // controller's perspective); give the microtask queue a turn.
    await new Promise((resolve) => setTimeout(resolve, 10));

    status = await registry.getStatus("run-1", TOK);
    expect(status.receipts[0].state).toBe("consumed");
  });

  it("handled disposition never regresses to consumed later", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const { controller, emitConsumed } = fakeController(() => ({
      disposition: "handled",
    }));
    registry.markReady("run-1", controller);

    const receipt = await registry.steer("run-1", TOK, {
      id: "m1",
      text: "hello",
    });
    expect(receipt.state).toBe("handled");

    emitConsumed("m1"); // must be ignored — "handled" is terminal
    await new Promise((resolve) => setTimeout(resolve, 10));

    const status = await registry.getStatus("run-1", TOK);
    expect(status.receipts[0].state).toBe("handled");
  });

  it("rejected disposition carries a reason", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const { controller } = fakeController(() => ({
      disposition: "rejected",
      reason: "controller disposed",
    }));
    registry.markReady("run-1", controller);

    const receipt = await registry.steer("run-1", TOK, {
      id: "m1",
      text: "hello",
    });
    expect(receipt.state).toBe("rejected");
    expect(receipt.reason).toBe("controller disposed");
  });

  it("a native throw never claims a definite rejection — reports uncertain", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const { controller } = fakeController(() => {
      throw new Error("native boom");
    });
    registry.markReady("run-1", controller);

    const receipt = await registry.steer("run-1", TOK, {
      id: "m1",
      text: "hello",
    });
    expect(receipt.state).toBe("uncertain");
  });

  it("same id + same payload is idempotent and never re-dispatches natively", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    let callCount = 0;
    const { controller } = fakeController(() => {
      callCount += 1;
      return { disposition: "queued" };
    });
    registry.markReady("run-1", controller);

    const first = await registry.steer("run-1", TOK, {
      id: "m1",
      text: "hello",
    });
    const second = await registry.steer("run-1", TOK, {
      id: "m1",
      text: "hello",
    });
    expect(callCount).toBe(1);
    expect(second).toEqual(first);
  });

  it("same id with a different payload 409s instead of re-dispatching", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const { controller } = fakeController(() => ({ disposition: "queued" }));
    registry.markReady("run-1", controller);

    await registry.steer("run-1", TOK, { id: "m1", text: "hello" });
    await expect(
      registry.steer("run-1", TOK, { id: "m1", text: "different" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("concurrent same-id steers settle to exactly one native dispatch", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    let callCount = 0;
    const { controller } = fakeController(async () => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { disposition: "queued" };
    });
    registry.markReady("run-1", controller);

    const [a, b] = await Promise.all([
      registry.steer("run-1", TOK, { id: "m1", text: "hello" }),
      registry.steer("run-1", TOK, { id: "m1", text: "hello" }),
    ]);
    expect(callCount).toBe(1);
    expect(a).toEqual(b);
  });

  it("an unregister racing an in-flight steer settles deterministically (no deadlock, no lost update)", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const { controller } = fakeController(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { disposition: "queued" };
    });
    registry.markReady("run-1", controller);

    const steerPromise = registry.steer("run-1", TOK, {
      id: "m1",
      text: "hello",
    });
    const unregisterPromise = registry.unregisterRun("run-1");

    const [receipt] = await Promise.all([steerPromise, unregisterPromise]);
    // Whichever order the queue serialized these in, the receipt must be a
    // real terminal/accepted-or-uncertain outcome, not a dangling promise.
    expect(["accepted", "uncertain", "handled", "rejected"]).toContain(
      receipt.state,
    );
    const status = await registry.getStatus("run-1", TOK);
    expect(status.active).toBe(false);
  });
});

describe("LiveRunRegistry — malformed messages", () => {
  it("rejects a message without an id", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    await expect(
      registry.steer("run-1", TOK, { text: "no id" }),
    ).rejects.toMatchObject({ code: "malformed" });
  });

  it("rejects oversized text", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    await expect(
      registry.steer("run-1", TOK, {
        id: "m1",
        text: "x".repeat(100_000),
      }),
    ).rejects.toMatchObject({ code: "malformed" });
  });

  it("rejects too many images", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    await expect(
      registry.steer("run-1", TOK, {
        id: "m1",
        text: "hi",
        images: Array.from({ length: 20 }, () => ({
          data: "AA==",
          mimeType: "image/png",
        })),
      }),
    ).rejects.toMatchObject({ code: "malformed" });
  });
});

describe("LiveRunRegistry — restart / stale owners", () => {
  it("a restart presents previously-accepted receipts as uncertain, never resends, and never rewrites the journal", async () => {
    const registryA = new LiveRunRegistry({ stateDir });
    await registryA.registerRun("run-1", TOK, true);
    let callCount = 0;
    const { controller } = fakeController(() => {
      callCount += 1;
      return { disposition: "queued" }; // never consumed — simulates crash before onConsumed
    });
    registryA.markReady("run-1", controller);
    await registryA.steer("run-1", TOK, { id: "m1", text: "hello" });

    // Simulate process restart: a brand new registry pointed at the same
    // state dir, with no in-memory record of "run-1" at all.
    const registryB = new LiveRunRegistry({ stateDir });
    const status = await registryB.getStatus("run-1", TOK);
    expect(status.active).toBe(false);
    expect(status.receipts[0].state).toBe("uncertain");
    expect(callCount).toBe(1); // restart must never re-dispatch

    // The read-time "uncertain" presentation must not have mutated the
    // on-disk receipt — it is still "accepted" underneath.
    const runDirs = await readdir(stateDir);
    let rawState: string | undefined;
    for (const dir of runDirs) {
      const receiptsDir = join(stateDir, dir, "receipts");
      let files: string[] = [];
      try {
        files = await readdir(receiptsDir);
      } catch {
        continue;
      }
      for (const file of files) {
        const raw = JSON.parse(await readFile(join(receiptsDir, file), "utf8"));
        rawState = raw.state;
      }
    }
    expect(rawState).toBe("accepted");
  });

  it("denies re-registering a runId that existed before a restart", async () => {
    const registryA = new LiveRunRegistry({ stateDir });
    await registryA.registerRun("run-1", TOK, true);
    await registryA.unregisterRun("run-1");

    const registryB = new LiveRunRegistry({ stateDir });
    await expect(
      registryB.registerRun("run-1", TOK_B, true),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("two registries sharing a state dir cannot both claim the same runId", async () => {
    const registryA = new LiveRunRegistry({ stateDir });
    const registryB = new LiveRunRegistry({ stateDir });
    await registryA.registerRun("run-1", TOK_A, true);
    await expect(
      registryB.registerRun("run-1", TOK_B, true),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("status on a never-registered-in-memory run requires the original owner token", async () => {
    const registryA = new LiveRunRegistry({ stateDir });
    await registryA.registerRun("run-1", SECRET_TOK, true);
    await registryA.unregisterRun("run-1");

    const registryB = new LiveRunRegistry({ stateDir });
    await expect(registryB.getStatus("run-1", WRONG_TOK)).rejects.toMatchObject(
      { code: "not_found" },
    );
    await expect(
      registryB.getStatus("run-1", SECRET_TOK),
    ).resolves.toMatchObject({ active: false });
  });

  it("a different process's still-live run is never touched by this process's read-only status check", async () => {
    // registryA holds "run-1" live (never unregistered) — simulating a
    // second daemon process sharing the state dir while still running.
    const registryA = new LiveRunRegistry({ stateDir });
    await registryA.registerRun("run-1", TOK, true);
    let callCount = 0;
    const { controller } = fakeController(() => {
      callCount += 1;
      return { disposition: "queued" };
    });
    registryA.markReady("run-1", controller);
    await registryA.steer("run-1", TOK, { id: "m1", text: "hello" });

    // registryB is a different in-memory instance pointed at the same
    // state dir (simulating a separate process) with no claim on "run-1".
    const registryB = new LiveRunRegistry({ stateDir });
    await expect(
      registryB.registerRun("run-1", TOK_B, true),
    ).rejects.toMatchObject({ code: "conflict" });

    // registryA (the real owner) must still see its own accepted receipt
    // as "accepted" — registryB's conflict probe must not have flipped it.
    const statusA = await registryA.getStatus("run-1", TOK);
    expect(statusA.receipts[0].state).toBe("accepted");
    expect(callCount).toBe(1);
  });
});

describe("LiveRunRegistry — journal unavailable fails closed for controlled runs", () => {
  it("stateDir: null fails registerRun closed (unsupported), never a memory-only success", async () => {
    const registry = new LiveRunRegistry({ stateDir: null });
    expect(await registry.supportsDurableControl()).toBe(false);

    let nativeCallCount = 0;
    await expect(
      registry.registerRun("run-1", TOK, true),
    ).rejects.toMatchObject({ code: "unsupported" });

    // Nothing should have been admitted in-memory either — a subsequent
    // steer must 404 (unknown run), not reach a controller.
    const { controller } = fakeController(() => {
      nativeCallCount += 1;
      return { disposition: "queued" };
    });
    registry.markReady("run-1", controller); // no-op: run was never registered
    await expect(
      registry.steer("run-1", TOK, { id: "m1", text: "hi" }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(nativeCallCount).toBe(0);
  });

  it("a real journal init failure (unusable dir) also fails registerRun closed, never a silent in-memory success", async () => {
    // A path whose parent is a regular file — mkdir(..., {recursive:true})
    // cannot create a directory underneath a file, so journal init fails.
    const blockerFile = join(stateDir, "blocker-file");
    await writeFile(blockerFile, "not a directory");
    const registry = new LiveRunRegistry({
      stateDir: join(blockerFile, "nested"),
    });
    expect(await registry.supportsDurableControl()).toBe(false);
    await expect(
      registry.registerRun("run-1", TOK, true),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("generic capabilities probe reports supportedPiSteer:false when durability is unavailable", async () => {
    const registry = new LiveRunRegistry({ stateDir: null });
    expect(await registry.supportsDurableControl()).toBe(false);
  });
});

describe("LiveRunRegistry — restart retries and failed receipts", () => {
  it("reconciles retained same-ID retries after restart without redispatching", async () => {
    const first = new LiveRunRegistry({ stateDir });
    let calls = 0;
    const { controller } = fakeController(() => {
      calls++;
      return { disposition: "queued" };
    });
    await first.registerRun("restart-run", TOK, true);
    first.markReady("restart-run", controller);
    const message = { id: "stable-retry", text: "keep this exact instruction" };
    await first.steer("restart-run", TOK, message);
    await first.unregisterRun("restart-run");
    const restarted = new LiveRunRegistry({ stateDir });
    expect(await restarted.steer("restart-run", TOK, message)).toMatchObject({
      id: message.id,
      state: "uncertain",
    });
    await expect(
      restarted.steer("restart-run", TOK, { ...message, text: "different" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      restarted.steer("restart-run", TOK, { id: "new-id", text: "new" }),
    ).rejects.toMatchObject({ code: "closed" });
    await expect(
      restarted.steer("restart-run", WRONG_TOK, message),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(calls).toBe(1);
  });

  it("does not turn accepted into certain delivery when closing journal writes fail", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    const { controller } = fakeController(() => ({ disposition: "queued" }));
    await registry.registerRun("close-write-fails", TOK, true);
    registry.markReady("close-write-fails", controller);
    await registry.steer("close-write-fails", TOK, {
      id: "m",
      text: "pending",
    });
    vi.spyOn(ControlJournal.prototype, "releaseRun").mockRejectedValueOnce(
      new Error("fixture failure"),
    );
    await expect(registry.unregisterRun("close-write-fails")).rejects.toThrow(
      "fixture failure",
    );
    const status = await registry.getStatus("close-write-fails", TOK);
    expect(status.active).toBe(false);
    expect(status.receipts[0].state).toBe("uncertain");
  });

  it("does not reopen a closed run when readiness arrives late", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("late-ready", TOK, true);
    await registry.unregisterRun("late-ready");
    const { controller } = fakeController(() => ({ disposition: "queued" }));
    registry.markReady("late-ready", controller);
    expect(await registry.getStatus("late-ready", TOK)).toMatchObject({
      active: false,
      ready: false,
    });
  });

  it("contains asynchronous consumption journal failures without permitting another dispatch", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    let calls = 0;
    const { controller, emitConsumed } = fakeController(() => {
      calls++;
      return { disposition: "queued" };
    });
    await registry.registerRun("consumption-write-fails", TOK, true);
    registry.markReady("consumption-write-fails", controller);
    const message = { id: "m", text: "do not repeat" };
    await registry.steer("consumption-write-fails", TOK, message);
    vi.spyOn(ControlJournal.prototype, "putReceipt").mockRejectedValueOnce(
      new Error("fixture write failure"),
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    emitConsumed(message.id);
    for (let i = 0; i < 30 && warning.mock.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(warning).toHaveBeenCalledWith(
      "[bunny-agent] failed to persist a consumption receipt",
    );
    await registry.steer("consumption-write-fails", TOK, message);
    expect(calls).toBe(1);
    await registry.unregisterRun("consumption-write-fails");
    expect(
      (await registry.getStatus("consumption-write-fails", TOK)).receipts[0]
        .state,
    ).toBe("uncertain");
  });
});

describe("LiveRunRegistry — configured profile", () => {
  it("surfaces runner/model on authenticated status once provided at registration", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true, {
      runner: "pi",
      model: "gpt-5",
    });
    const status = await registry.getStatus("run-1", TOK);
    expect(status).toMatchObject({ runner: "pi", model: "gpt-5" });
  });

  it("omits runner/model when no profile was passed (no behavior change)", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const status = await registry.getStatus("run-1", TOK);
    expect(status.runner).toBeUndefined();
    expect(status.model).toBeUndefined();
  });
});
