import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AppState } from "../utils.js";
import {
  AppError,
  ensureDir,
  ok,
  resolveUnderRoot,
  resolveVolumeRoot,
} from "../utils.js";

const exec = promisify(execFile);

const ALLOWED_GIT_COMMANDS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "branch",
  "checkout",
  "add",
  "commit",
  "reset",
  "init",
  "rev-parse",
  "fetch",
  "pull",
  "push",
  "merge",
  "rebase",
  "remote",
  "tag",
  "ls-files",
]);

interface GitCommandResponse {
  stdout: string;
  stderr: string;
  code: number;
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<GitCommandResponse> {
  try {
    const { stdout, stderr } = await exec("git", ["-C", cwd, ...args], {
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as {
      code?: string | number;
      stdout?: string;
      stderr?: string;
    };
    if (e.code === "ENOENT") throw new AppError(500, "git not found");
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

export async function gitStatus(
  state: AppState,
  body: { volume?: string; repo: string },
) {
  const root = resolveVolumeRoot(state, body.volume);
  const repo = resolveUnderRoot(root, body.repo);
  const result = await runGit(repo, ["status", "--short", "--branch"]);
  return ok(result);
}

export async function gitExec(
  state: AppState,
  body: { volume?: string; repo: string; args: string[] },
) {
  if (!body.args?.length) throw new AppError(400, "args cannot be empty");
  if (!ALLOWED_GIT_COMMANDS.has(body.args[0])) {
    throw new AppError(400, `unsupported git command: ${body.args[0]}`);
  }
  const root = resolveVolumeRoot(state, body.volume);
  const repo = resolveUnderRoot(root, body.repo);
  return ok(await runGit(repo, body.args));
}

export async function gitClone(
  state: AppState,
  body: {
    volume?: string;
    repo_parent: string;
    url: string;
    branch?: string;
    depth?: number;
    target_dir?: string;
    list_files_limit?: number;
  },
) {
  const root = resolveVolumeRoot(state, body.volume);
  const parent = resolveUnderRoot(root, body.repo_parent);
  await ensureDir(parent);

  const args = ["clone"];
  if (body.depth) args.push("--depth", String(body.depth));
  if (body.branch) args.push("--branch", body.branch);
  args.push(body.url);
  if (body.target_dir) args.push(body.target_dir);

  const command = await runGit(parent, args);

  // Infer repo path
  const dirName =
    body.target_dir ??
    body.url
      .replace(/\/$/, "")
      .split(/[/:]/)
      .pop()!
      .replace(/\.git$/, "");
  const repoPath = resolveUnderRoot(parent, dirName);

  // List tracked files
  const lsResult = await runGit(repoPath, ["ls-files"]).catch(() => ({
    stdout: "",
    stderr: "",
    code: 1,
  }));
  const allFiles = lsResult.stdout.split("\n").filter(Boolean);
  const limit = Math.min(body.list_files_limit ?? 200, 5000);

  return ok({
    repo_path: repoPath,
    tracked_files_count: allFiles.length,
    tracked_files: allFiles.slice(0, limit),
    tracked_files_truncated: allFiles.length > limit,
    command,
  });
}

export async function gitInit(
  state: AppState,
  body: { volume?: string; repo: string; initial_branch?: string },
) {
  const root = resolveVolumeRoot(state, body.volume);
  const repo = resolveUnderRoot(root, body.repo);
  await ensureDir(repo);
  const args = ["init"];
  if (body.initial_branch) args.push("-b", body.initial_branch);
  return ok(await runGit(repo, args));
}
