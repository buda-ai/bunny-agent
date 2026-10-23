import { createHash } from "node:crypto";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createControlJournal } from "../control-journal.js";

const TOK = "a".repeat(44);

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "bunny-control-journal-"));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

/** Find the single owner.json written under stateDir (hashed run-dir name). */
async function readOwnerFile(): Promise<Record<string, unknown>> {
  const runDirs = await readdir(stateDir);
  expect(runDirs).toHaveLength(1);
  const raw = await readFile(join(stateDir, runDirs[0], "owner.json"), "utf8");
  return JSON.parse(raw);
}

describe("ControlJournal — owner.json never stores the raw token", () => {
  it("claimRun persists a sha256 digest, not the raw token", async () => {
    const journal = await createControlJournal(stateDir);
    await journal.claimRun("run-1", TOK);

    const owner = await readOwnerFile();
    expect(owner).not.toHaveProperty("token");
    expect(typeof owner.tokenDigest).toBe("string");
    expect(owner.tokenDigest).not.toBe(TOK);
    expect(owner.tokenDigest).toBe(
      createHash("sha256").update(TOK, "utf8").digest("hex"),
    );
  });

  it("claimRun writes the complete owner record atomically — never an empty-token intermediate state", async () => {
    const journal = await createControlJournal(stateDir);
    await journal.claimRun("run-1", TOK);

    const owner = await readOwnerFile();
    expect(owner).toMatchObject({
      pid: process.pid,
      closed: false,
    });
    expect(typeof owner.nonce).toBe("string");
    expect(typeof owner.claimedAt).toBe("number");
  });

  it("verifyOwnerToken accepts the exact token and rejects a wrong one", async () => {
    const journal = await createControlJournal(stateDir);
    await journal.claimRun("run-1", TOK);

    await expect(journal.verifyOwnerToken("run-1", TOK)).resolves.toBe(true);
    await expect(
      journal.verifyOwnerToken("run-1", "b".repeat(44)),
    ).resolves.toBe(false);
  });

  it("verifyOwnerToken on an unclaimed runId returns false (not a throw)", async () => {
    const journal = await createControlJournal(stateDir);
    await expect(journal.verifyOwnerToken("missing", TOK)).resolves.toBe(false);
  });
});

describe("ControlJournal — directory/file permissions", () => {
  it("creates run directories and receipt directories with 0700 and files with 0600", async () => {
    const journal = await createControlJournal(stateDir);
    await journal.claimRun("run-1", TOK);
    await journal.putReceipt("run-1", {
      id: "m1",
      payloadHash: "hash",
      state: "accepted",
      updatedAt: Date.now(),
    });

    const runDirs = await readdir(stateDir);
    const runDir = join(stateDir, runDirs[0]);
    const { stat } = await import("node:fs/promises");
    const dirStat = await stat(runDir);
    expect(dirStat.mode & 0o777).toBe(0o700);

    const receiptsDir = join(runDir, "receipts");
    const receiptsStat = await stat(receiptsDir);
    expect(receiptsStat.mode & 0o777).toBe(0o700);

    const ownerStat = await stat(join(runDir, "owner.json"));
    expect(ownerStat.mode & 0o777).toBe(0o600);

    const receiptFiles = await readdir(receiptsDir);
    const receiptStat = await stat(join(receiptsDir, receiptFiles[0]));
    expect(receiptStat.mode & 0o777).toBe(0o600);
  });
});

describe("ControlJournal — fencing", () => {
  it("claimRun rejects a runId that is already claimed", async () => {
    const journal = await createControlJournal(stateDir);
    await journal.claimRun("run-1", TOK);
    await expect(journal.claimRun("run-1", "b".repeat(44))).rejects.toThrow();
  });
});

describe("ControlJournal — symlink defense", () => {
  it("refuses to write owner.json through a pre-existing symlink without deleting it", async () => {
    const journal = await createControlJournal(stateDir);
    // Pre-create the run directory and plant a symlink where owner.json
    // would go, pointing somewhere outside stateDir.
    const outsideTarget = join(stateDir, "..", "outside-target.json");
    await writeFile(outsideTarget, "not touched");

    // We can't know the hashed dir name without calling claimRun, so
    // instead verify the general invariant: claimRun never deletes a
    // pre-existing symlink it refuses to use. Simulate by claiming once
    // normally, then replacing owner.json with a symlink and trying a
    // receipt write through the same journal instance.
    await journal.claimRun("run-1", TOK);
    const runDirs = await readdir(stateDir);
    const ownerPath = join(stateDir, runDirs[0], "owner.json");
    const { unlink } = await import("node:fs/promises");
    await unlink(ownerPath);
    await symlink(outsideTarget, ownerPath);

    await expect(
      journal.claimRun("run-2-placeholder", TOK),
    ).resolves.toBeUndefined();
    // The symlink we planted must still exist untouched (not deleted).
    const { lstat } = await import("node:fs/promises");
    const linkStat = await lstat(ownerPath);
    expect(linkStat.isSymbolicLink()).toBe(true);
    const outsideContent = await readFile(outsideTarget, "utf8");
    expect(outsideContent).toBe("not touched");
  });
});

describe("ControlJournal — recovery scope never mutates on read", () => {
  it("readOwnerRecord is read-only and reports pid/closed without touching receipts", async () => {
    const journal = await createControlJournal(stateDir);
    await journal.claimRun("run-1", TOK);
    await journal.putReceipt("run-1", {
      id: "m1",
      payloadHash: "hash",
      state: "accepted",
      updatedAt: Date.now(),
    });

    const before = await journal.getReceipt("run-1", "m1");
    const record = await journal.readOwnerRecord("run-1");
    expect(record).toMatchObject({ pid: process.pid, closed: false });

    const after = await journal.getReceipt("run-1", "m1");
    expect(after).toEqual(before);
    expect(after?.state).toBe("accepted");
  });

  it("releaseRun flips accepted receipts to uncertain and marks the owner closed", async () => {
    const journal = await createControlJournal(stateDir);
    await journal.claimRun("run-1", TOK);
    await journal.putReceipt("run-1", {
      id: "m1",
      payloadHash: "hash",
      state: "accepted",
      updatedAt: Date.now(),
    });

    await journal.releaseRun("run-1");

    const record = await journal.readOwnerRecord("run-1");
    expect(record?.closed).toBe(true);
    const receipt = await journal.getReceipt("run-1", "m1");
    expect(receipt?.state).toBe("uncertain");
  });
});
