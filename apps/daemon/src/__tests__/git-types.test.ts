/**
 * Verify that shared git-types are importable and structurally correct.
 */
import { describe, expect, it } from "vitest";
import type {
  ApiEnvelope,
  GitCloneRequest,
  GitCloneResponse,
  GitCloneResult,
  GitCommandResult,
  GitExecRequest,
  GitExecResponse,
  GitInitRequest,
  GitInitResponse,
  GitStatusRequest,
  GitStatusResponse,
} from "../shared/git-types.js";

describe("shared/git-types", () => {
  it("GitStatusRequest accepts minimal shape", () => {
    const req: GitStatusRequest = { repo: "." };
    expect(req.repo).toBe(".");
    expect(req.volume).toBeUndefined();
  });

  it("GitExecRequest accepts args array", () => {
    const req: GitExecRequest = { repo: ".", args: ["log", "--oneline"] };
    expect(req.args).toHaveLength(2);
  });

  it("GitCloneRequest accepts full shape", () => {
    const req: GitCloneRequest = {
      repo_parent: "/tmp",
      url: "https://github.com/test/repo.git",
      branch: "main",
      depth: 1,
    };
    expect(req.url).toContain("github.com");
  });

  it("GitInitRequest accepts optional initial_branch", () => {
    const req: GitInitRequest = { repo: "/tmp/new", initial_branch: "main" };
    expect(req.initial_branch).toBe("main");
  });

  it("ApiEnvelope shapes are consistent", () => {
    const ok: ApiEnvelope<GitCommandResult> = {
      ok: true,
      data: { stdout: "ok", stderr: "", code: 0 },
      error: null,
    };
    expect(ok.ok).toBe(true);
    expect(ok.data?.code).toBe(0);

    const fail: ApiEnvelope<null> = { ok: false, data: null, error: "boom" };
    expect(fail.ok).toBe(false);
  });

  it("GitCloneResult has expected fields", () => {
    const result: GitCloneResult = {
      repo_path: "/tmp/repo",
      tracked_files_count: 5,
      tracked_files: ["a.ts", "b.ts"],
      tracked_files_truncated: false,
      command: { stdout: "", stderr: "", code: 0 },
    };
    expect(result.tracked_files_count).toBe(5);
  });

  it("Response types are ApiEnvelope wrappers", () => {
    // Compile-time check: these assignments must type-check
    const _status: GitStatusResponse = { ok: true, data: { stdout: "", stderr: "", code: 0 }, error: null };
    const _exec: GitExecResponse = { ok: true, data: { stdout: "", stderr: "", code: 0 }, error: null };
    const _init: GitInitResponse = { ok: true, data: { stdout: "", stderr: "", code: 0 }, error: null };
    const _clone: GitCloneResponse = {
      ok: true,
      data: { repo_path: "/x", tracked_files_count: 0, tracked_files: [], tracked_files_truncated: false, command: { stdout: "", stderr: "", code: 0 } },
      error: null,
    };
    expect(_status.ok).toBe(true);
    expect(_exec.ok).toBe(true);
    expect(_init.ok).toBe(true);
    expect(_clone.ok).toBe(true);
  });
});
