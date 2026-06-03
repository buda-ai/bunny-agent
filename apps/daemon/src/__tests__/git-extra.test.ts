import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitExec, gitInit, gitRpc, gitStatus } from "../routes/git.js";
import type { AppState } from "../utils.js";

describe("git route command coverage", () => {
  let root: string;
  let state: AppState;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "daemon-git-extra-"));
    state = { root };
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function initRepo(repo = "repo"): Promise<string> {
    const result = await gitInit(state, { repo, initial_branch: "main" });
    expect(result.data.code).toBe(0);
    const repoPath = path.join(root, repo);
    await childProcess.execFileSync("git", [
      "-C",
      repoPath,
      "config",
      "user.email",
      "test@example.com",
    ]);
    await childProcess.execFileSync("git", [
      "-C",
      repoPath,
      "config",
      "user.name",
      "Test User",
    ]);
    return repoPath;
  }

  async function commitFile(
    repoPath: string,
    filepath: string,
    content: string,
    message: string,
  ): Promise<void> {
    await fs.writeFile(path.join(repoPath, filepath), content);
    await gitExec(state, {
      repo: path.relative(root, repoPath),
      args: ["add", filepath],
    });
    const commit = await gitExec(state, {
      repo: path.relative(root, repoPath),
      args: ["commit", "--message", message],
    });
    expect(commit.data.code).toBe(0);
  }

  it("covers status, log depth forms, branch, checkout, reset, rev-parse, remote, and tags", async () => {
    const repoPath = await initRepo();
    await commitFile(repoPath, "a.txt", "one", "first");
    await fs.writeFile(path.join(repoPath, "a.txt"), "changed");

    const status = await gitStatus(state, { repo: "repo" });
    expect(status.data.stdout).toContain("## main");
    expect(status.data.stdout).toContain("M a.txt");

    const reset = await gitExec(state, {
      repo: "repo",
      args: ["reset", "a.txt"],
    });
    expect(reset.data.code).toBe(0);

    const branch = await gitExec(state, {
      repo: "repo",
      args: ["branch", "next"],
    });
    expect(branch.data.code).toBe(0);
    expect(
      (await gitExec(state, { repo: "repo", args: ["branch"] })).data.stdout,
    ).toContain("next");

    const checkout = await gitExec(state, {
      repo: "repo",
      args: ["checkout", "-B", "work"],
    });
    expect(checkout.data.code).toBe(0);

    expect(
      (
        await gitExec(state, {
          repo: "repo",
          args: ["rev-parse", "--show-toplevel"],
        })
      ).data.stdout,
    ).toBe(`${repoPath}\n`);
    expect(
      (await gitExec(state, { repo: "repo", args: ["log", "-n1"] })).data
        .stdout,
    ).toContain("first");
    expect(
      (await gitExec(state, { repo: "repo", args: ["log", "--max-count=1"] }))
        .data.stdout,
    ).toContain("first");

    expect(
      (
        await gitExec(state, {
          repo: "repo",
          args: ["remote", "add", "origin", "https://example.com/repo.git"],
        })
      ).data.code,
    ).toBe(0);
    expect(
      (await gitExec(state, { repo: "repo", args: ["remote", "-v"] })).data
        .stdout,
    ).toContain("origin");
    expect(
      (await gitExec(state, { repo: "repo", args: ["remote"] })).data.stdout,
    ).toBe("origin\n");
    expect(
      (await gitExec(state, { repo: "repo", args: ["remote", "rm", "origin"] }))
        .data.code,
    ).toBe(0);

    expect(
      (await gitExec(state, { repo: "repo", args: ["tag", "v1"] })).data.code,
    ).toBe(0);
    expect(
      (await gitExec(state, { repo: "repo", args: ["tag"] })).data.stdout,
    ).toBe("v1\n");
  });

  it("reports staged, unstaged, deleted, and untracked status codes", async () => {
    const repoPath = await initRepo();
    await commitFile(repoPath, "tracked.txt", "one", "first");

    await fs.writeFile(path.join(repoPath, "added.txt"), "new");
    await gitExec(state, { repo: "repo", args: ["add", "added.txt"] });
    await fs.writeFile(path.join(repoPath, "tracked.txt"), "changed");
    await fs.writeFile(path.join(repoPath, "untracked.txt"), "loose");
    await fs.unlink(path.join(repoPath, "added.txt"));

    const status = await gitExec(state, {
      repo: "repo",
      args: ["status", "--short"],
    });

    expect(status.data.stdout).toContain("AD added.txt");
    expect(status.data.stdout).toContain(" M tracked.txt");
    expect(status.data.stdout).toContain("?? untracked.txt");
  });

  it("returns unsupported command results for invalid allowed argument forms", async () => {
    await initRepo();

    for (const args of [
      ["status", "--porcelain"],
      ["log", "--bad"],
      ["branch", "-x"],
      ["checkout", "--detach"],
      ["add"],
      ["commit"],
      ["reset"],
      ["rev-parse"],
      ["init", "--bad"],
      ["fetch", "--depth=0"],
      ["merge", "--squash", "main"],
      ["remote", "rename", "a", "b"],
      ["tag", "-d", "v1"],
      ["ls-files", "--others"],
      ["show"],
    ]) {
      const result = await gitExec(state, { repo: "repo", args });
      expect(result.data.code).toBe(1);
      expect(result.data.stderr).toContain("unsupported git arguments");
    }
  });

  it("wraps isomorphic-git rpc errors and validates commands", async () => {
    await expect(
      gitRpc(state, { repo: "rpc", command: "" as never }),
    ).rejects.toThrow("missing git command");

    await expect(
      gitRpc(state, {
        repo: "rpc",
        command: "notACommand" as never,
      }),
    ).rejects.toThrow("unsupported or invalid git command");

    const result = await gitRpc(state, {
      repo: "rpc",
      command: "init",
      options: { defaultBranch: "main" },
    });
    expect(result.ok).toBe(true);

    await expect(
      gitRpc(state, {
        repo: "rpc",
        command: "resolveRef",
        options: { ref: "missing" },
      }),
    ).rejects.toThrow();
  });
});
