import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted; use vi.hoisted to safely share fixtures with the factory.
const { forkSessionMock, RunnerForkUnsupportedError, ForkSourceNotFoundError } =
  vi.hoisted(() => {
    class RunnerForkUnsupportedError extends Error {
      constructor(runner: string) {
        super(`Session fork is not supported for runner: ${runner}`);
        this.name = "RunnerForkUnsupportedError";
      }
    }
    class ForkSourceNotFoundError extends Error {
      constructor(sourceSessionId: string) {
        super(`Pi fork: source session not found: ${sourceSessionId}`);
        this.name = "ForkSourceNotFoundError";
      }
    }
    return {
      forkSessionMock: vi.fn(),
      RunnerForkUnsupportedError,
      ForkSourceNotFoundError,
    };
  });

// Mock the harness so the daemon test doesn't need a real pi runtime.
vi.mock("@bunny-agent/runner-harness", () => ({
  forkSession: forkSessionMock,
  RunnerForkUnsupportedError,
  ForkSourceNotFoundError,
}));

import { DaemonRouter } from "../router.js";

describe("POST /api/session/fork", () => {
  let root: string;
  let router: DaemonRouter;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "daemon-sessions-test-"));
    router = new DaemonRouter({ root });
    forkSessionMock.mockReset();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns 200 with new session id on success", async () => {
    forkSessionMock.mockReturnValue({
      runner: "pi",
      newSessionId: "new-id",
      newSessionPath: "/agent/.pi/agent/sessions/x/ts_new-id.jsonl",
      sourcePath: "/agent/.pi/agent/sessions/x/ts_src.jsonl",
    });

    const res = await router.handle("POST", "/api/session/fork", {
      volume: "agent",
      runner: "pi",
      sourceSessionId: "src",
    });

    expect(res?.status).toBe(200);
    expect(res?.body).toEqual({
      ok: true,
      data: {
        runner: "pi",
        newSessionId: "new-id",
        newSessionPath: "/agent/.pi/agent/sessions/x/ts_new-id.jsonl",
        sourcePath: "/agent/.pi/agent/sessions/x/ts_src.jsonl",
      },
      error: null,
    });
    expect(forkSessionMock).toHaveBeenCalledWith({
      runner: "pi",
      // resolveVolumeRoot with volume="agent" and no /agent mount falls back
      // to <root>/volumes/agent under a tmp dir.
      cwd: expect.stringContaining("volumes/agent"),
      sourceSessionId: "src",
    });
  });

  it("returns 400 when runner is missing", async () => {
    const res = await router.handle("POST", "/api/session/fork", {
      sourceSessionId: "src",
    });
    expect(res?.status).toBe(400);
    expect(res?.body.ok).toBe(false);
    expect(forkSessionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when sourceSessionId is missing", async () => {
    const res = await router.handle("POST", "/api/session/fork", {
      runner: "pi",
    });
    expect(res?.status).toBe(400);
    expect(res?.body.ok).toBe(false);
    expect(forkSessionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the runner does not support fork", async () => {
    forkSessionMock.mockImplementation(() => {
      throw new RunnerForkUnsupportedError("claude");
    });

    const res = await router.handle("POST", "/api/session/fork", {
      runner: "claude",
      sourceSessionId: "src",
    });
    expect(res?.status).toBe(400);
    expect(res?.body.ok).toBe(false);
    expect(res?.body.error).toContain("not supported");
  });

  it("returns 404 when the source session is missing on disk", async () => {
    forkSessionMock.mockImplementation(() => {
      throw new ForkSourceNotFoundError("src");
    });

    const res = await router.handle("POST", "/api/session/fork", {
      runner: "pi",
      sourceSessionId: "src",
    });
    expect(res?.status).toBe(404);
    expect(res?.body.ok).toBe(false);
    expect(res?.body.error).toContain("source session not found");
  });

  it("propagates unknown errors as 500", async () => {
    forkSessionMock.mockImplementation(() => {
      throw new Error("kaboom");
    });

    const res = await router.handle("POST", "/api/session/fork", {
      runner: "pi",
      sourceSessionId: "src",
    });
    expect(res?.status).toBe(500);
    expect(res?.body.ok).toBe(false);
    expect(res?.body.error).toBe("kaboom");
  });
});
