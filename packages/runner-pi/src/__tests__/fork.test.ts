import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ForkSourceNotFoundError, forkPiSession } from "../fork.js";

describe("forkPiSession", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "runner-pi-fork-cwd-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  // The happy path exercises SessionManager.forkFrom against real files
  // under ~/.pi/agent/sessions/<encoded-cwd>/ which we cannot cleanly
  // redirect from this unit test (pi resolves HOME internally). That path
  // is covered end-to-end by the daemon integration tests. Here we only
  // pin the "id not on disk" branch since it is a pure resolver check.

  it("throws ForkSourceNotFoundError when the source id is unknown", () => {
    expect(() =>
      forkPiSession({ cwd, sourceSessionId: "does-not-exist" }),
    ).toThrow(ForkSourceNotFoundError);
  });

  it("throws ForkSourceNotFoundError for an empty source id", () => {
    expect(() => forkPiSession({ cwd, sourceSessionId: "   " })).toThrow(
      ForkSourceNotFoundError,
    );
  });
});
