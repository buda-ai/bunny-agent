import * as fs from "node:fs";
import * as path from "node:path";
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type {
  GitCloneRequest,
  GitCommandResult,
  GitExecRequest,
  GitInitRequest,
  GitStatusRequest,
} from "../shared/git-types.js";
import type { AppState } from "../utils.js";
import {
  AppError,
  ensureDir,
  ok,
  resolveUnderRoot,
  resolveVolumeRoot,
} from "../utils.js";

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

interface ExecContext {
  cwd: string;
  args: string[];
}

interface CommandFailure {
  stdout?: string;
  stderr: string;
  code?: number;
}

type StatusCode = " " | "M" | "A" | "D" | "?";

function success(stdout = "", stderr = ""): GitCommandResult {
  return { stdout, stderr, code: 0 };
}

function failure(stderr: string, stdout = "", code = 1): GitCommandResult {
  return { stdout, stderr, code };
}

function unsupported(args: string[]): GitCommandResult {
  return failure(`unsupported git arguments: ${args.join(" ")}`);
}

function toCommandResult(err: unknown): GitCommandResult {
  const e = err as Partial<CommandFailure> & { message?: string };
  return failure(
    e.stderr ?? e.message ?? String(err),
    e.stdout ?? "",
    e.code ?? 1,
  );
}

async function runGit(cwd: string, args: string[]): Promise<GitCommandResult> {
  try {
    return await dispatchGitCommand({ cwd, args });
  } catch (err) {
    return toCommandResult(err);
  }
}

async function dispatchGitCommand(ctx: ExecContext): Promise<GitCommandResult> {
  const [command, ...rest] = ctx.args;
  switch (command) {
    case "status":
      return gitStatusCommand(ctx.cwd, rest);
    case "log":
      return gitLogCommand(ctx.cwd, rest);
    case "branch":
      return gitBranchCommand(ctx.cwd, rest);
    case "checkout":
      return gitCheckoutCommand(ctx.cwd, rest);
    case "add":
      return gitAddCommand(ctx.cwd, rest);
    case "commit":
      return gitCommitCommand(ctx.cwd, rest);
    case "reset":
      return gitResetCommand(ctx.cwd, rest);
    case "init":
      return gitInitCommand(ctx.cwd, rest);
    case "rev-parse":
      return gitRevParseCommand(ctx.cwd, rest);
    case "fetch":
      return gitFetchCommand(ctx.cwd, rest);
    case "pull":
      return gitPullCommand(ctx.cwd, rest);
    case "push":
      return gitPushCommand(ctx.cwd, rest);
    case "merge":
      return gitMergeCommand(ctx.cwd, rest);
    case "remote":
      return gitRemoteCommand(ctx.cwd, rest);
    case "tag":
      return gitTagCommand(ctx.cwd, rest);
    case "ls-files":
      return gitListFilesCommand(ctx.cwd, rest);
    case "diff":
    case "show":
    case "rebase":
      return unsupported(ctx.args);
    default:
      return unsupported(ctx.args);
  }
}

async function gitStatusCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  const short = args.includes("--short") || args.includes("-s");
  const branch = args.includes("--branch") || args.includes("-b");
  const unsupportedArgs = args.filter(
    (arg) => !["--short", "-s", "--branch", "-b"].includes(arg),
  );
  if (unsupportedArgs.length > 0) return unsupported(["status", ...args]);

  const lines: string[] = [];
  if (branch) {
    const current = await git.currentBranch({ fs, dir: cwd });
    lines.push(`## ${current ?? "HEAD (no branch)"}`);
  }

  const matrix = await git.statusMatrix({ fs, dir: cwd });
  for (const row of matrix) {
    const [filepath, head, workdir, stage] = row;
    const index = indexStatus(head, workdir, stage);
    const workingTree = workingTreeStatus(head, workdir, stage);
    if (index === " " && workingTree === " ") continue;
    if (short) {
      lines.push(`${index}${workingTree} ${filepath}`);
    } else {
      lines.push(`${index}${workingTree} ${filepath}`);
    }
  }

  return success(lines.length > 0 ? `${lines.join("\n")}\n` : "");
}

function indexStatus(head: number, workdir: number, stage: number): StatusCode {
  if (head === 0 && workdir === 2 && stage === 0) return "?";
  if (stage === head) return " ";
  if (head === 0 && stage !== 0) return "A";
  if (stage === 0) return "D";
  return "M";
}

function workingTreeStatus(
  head: number,
  workdir: number,
  stage: number,
): StatusCode {
  if (head === 0 && workdir === 2 && stage === 0) return "?";
  if (workdir === stage) return " ";
  if (workdir === 0) return "D";
  return "M";
}

async function gitLogCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  let depth = 10;
  let oneline = false;
  let ref: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--oneline") {
      oneline = true;
    } else if (arg === "-n" || arg === "--max-count") {
      const value = args[i + 1];
      if (!value) return unsupported(["log", ...args]);
      depth = Number.parseInt(value, 10);
      i += 1;
    } else if (arg.startsWith("-n") && arg.length > 2) {
      depth = Number.parseInt(arg.slice(2), 10);
    } else if (arg.startsWith("--max-count=")) {
      depth = Number.parseInt(arg.slice("--max-count=".length), 10);
    } else if (!arg.startsWith("-") && ref == null) {
      ref = arg;
    } else {
      return unsupported(["log", ...args]);
    }
  }

  if (!Number.isFinite(depth) || depth <= 0)
    return unsupported(["log", ...args]);

  const commits = await git.log({ fs, dir: cwd, depth, ref });
  const stdout = commits
    .map(({ oid, commit }) => {
      const message = commit.message.split("\n")[0] ?? "";
      if (oneline) return `${oid.slice(0, 7)} ${message}`;
      return [
        `commit ${oid}`,
        `Author: ${commit.author.name} <${commit.author.email}>`,
        `Date:   ${formatGitDate(commit.author.timestamp, commit.author.timezoneOffset)}`,
        "",
        `    ${message}`,
      ].join("\n");
    })
    .join("\n");
  return success(stdout ? `${stdout}\n` : "");
}

function formatGitDate(timestamp: number, timezoneOffset: number): string {
  const date = new Date(timestamp * 1000);
  const sign = timezoneOffset <= 0 ? "+" : "-";
  const abs = Math.abs(timezoneOffset);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  return `${date.toUTCString()} ${sign}${hours}${minutes}`;
}

async function gitBranchCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  if (args.length === 0) {
    const [branches, current] = await Promise.all([
      git.listBranches({ fs, dir: cwd }),
      git.currentBranch({ fs, dir: cwd }),
    ]);
    return success(
      branches
        .map((branch) => `${branch === current ? "*" : " "} ${branch}`)
        .join("\n") + "\n",
    );
  }
  if (args.length === 1 && !args[0].startsWith("-")) {
    await git.branch({ fs, dir: cwd, ref: args[0] });
    return success();
  }
  if (args.length === 2 && (args[0] === "-d" || args[0] === "-D")) {
    await git.deleteBranch({ fs, dir: cwd, ref: args[1] });
    return success();
  }
  return unsupported(["branch", ...args]);
}

async function gitCheckoutCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  if (args.length === 1 && !args[0].startsWith("-")) {
    await git.checkout({ fs, dir: cwd, ref: args[0] });
    return success();
  }
  if (args.length === 2 && (args[0] === "-b" || args[0] === "-B")) {
    await git.branch({
      fs,
      dir: cwd,
      ref: args[1],
      checkout: true,
      force: args[0] === "-B",
    });
    return success();
  }
  return unsupported(["checkout", ...args]);
}

async function gitAddCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  const force = args.includes("--force") || args.includes("-f");
  const filepaths = args.filter((arg) => !["--force", "-f"].includes(arg));
  if (filepaths.length === 0) return unsupported(["add", ...args]);
  await git.add({ fs, dir: cwd, filepath: filepaths, force });
  return success();
}

async function gitCommitCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  const messageParts: string[] = [];
  let amend = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-m" || arg === "--message") {
      const value = args[i + 1];
      if (!value) return unsupported(["commit", ...args]);
      messageParts.push(value);
      i += 1;
    } else if (arg.startsWith("--message=")) {
      messageParts.push(arg.slice("--message=".length));
    } else if (arg === "--amend") {
      amend = true;
    } else {
      return unsupported(["commit", ...args]);
    }
  }

  if (messageParts.length === 0) return unsupported(["commit", ...args]);

  const author = {
    name:
      process.env.GIT_AUTHOR_NAME ??
      process.env.GIT_COMMITTER_NAME ??
      "Bunny Agent",
    email:
      process.env.GIT_AUTHOR_EMAIL ??
      process.env.GIT_COMMITTER_EMAIL ??
      "bunny-agent@example.com",
  };
  const oid = await git.commit({
    fs,
    dir: cwd,
    message: messageParts.join("\n\n"),
    author,
    amend,
  });
  return success(`[${oid.slice(0, 7)}] ${messageParts[0]}\n`);
}

async function gitResetCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  if (args.length === 0) return unsupported(["reset", ...args]);

  // if arg is a ref (like HEAD, main), use it. Otherwise, assume it's a file path and let isomorphic-git default to HEAD.
  const isFirstArgRef = args[0] !== "--" && !args[0].startsWith("-") && args.length > 1 && !await fs.promises.stat(path.join(cwd, args[0])).then(() => true).catch(() => false);
  const ref = isFirstArgRef ? args[0] : undefined;

  const filepaths = args.filter(
    (arg, index) => !(index === 0 && ref === arg) && !arg.startsWith("-") && arg !== "--",
  );

  if (filepaths.length === 0) return unsupported(["reset", ...args]);
  for (const filepath of filepaths) {
    await git.resetIndex({ fs, dir: cwd, filepath, ref });
  }
  return success();
}

async function gitInitCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  let defaultBranch: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-b" || arg === "--initial-branch") {
      defaultBranch = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--initial-branch=")) {
      defaultBranch = arg.slice("--initial-branch=".length);
    } else {
      return unsupported(["init", ...args]);
    }
  }
  await ensureDir(cwd);
  await git.init({ fs, dir: cwd, defaultBranch });
  return success(
    `Initialized empty Git repository in ${path.join(cwd, ".git")}/\n`,
  );
}

async function gitRevParseCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  if (args.length !== 1) return unsupported(["rev-parse", ...args]);
  if (args[0] === "--show-toplevel") return success(`${cwd}\n`);
  const oid = await git.resolveRef({ fs, dir: cwd, ref: args[0] });
  return success(`${oid}\n`);
}

async function gitFetchCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  const options = parseRemoteArgs(args);
  if (options == null) return unsupported(["fetch", ...args]);
  const result = await git.fetch({
    fs,
    http,
    dir: cwd,
    remote: options.remote,
    ref: options.ref,
    depth: options.depth,
    singleBranch: options.ref != null,
  });
  return success(result.fetchHead ? `${result.fetchHead}\n` : "");
}

async function gitPullCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  const options = parseRemoteArgs(args);
  if (options == null) return unsupported(["pull", ...args]);
  const ref =
    options.ref ?? (await git.currentBranch({ fs, dir: cwd })) ?? undefined;
  await git.pull({
    fs,
    http,
    dir: cwd,
    remote: options.remote,
    ref,
    fastForwardOnly: true,
    singleBranch: ref != null,
    author: { name: "Bunny Agent", email: "bunny-agent@example.com" },
  });
  return success();
}

async function gitPushCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  const options = parseRemoteArgs(args);
  if (options == null) return unsupported(["push", ...args]);
  const result = await git.push({
    fs,
    http,
    dir: cwd,
    remote: options.remote,
    ref: options.ref,
    force: options.force,
  });
  return result.ok
    ? success(JSON.stringify(result, null, 2) + "\n")
    : failure(
        result.error ?? "push failed",
        JSON.stringify(result, null, 2) + "\n",
      );
}

function parseRemoteArgs(
  args: string[],
): { remote?: string; ref?: string; depth?: number; force?: boolean } | null {
  const positional: string[] = [];
  let depth: number | undefined;
  let force = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--depth") {
      const value = args[i + 1];
      if (!value) return null;
      depth = Number.parseInt(value, 10);
      i += 1;
    } else if (arg.startsWith("--depth=")) {
      depth = Number.parseInt(arg.slice("--depth=".length), 10);
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (arg.startsWith("-")) {
      return null;
    } else {
      positional.push(arg);
    }
  }
  if (depth != null && (!Number.isFinite(depth) || depth <= 0)) return null;
  if (positional.length > 2) return null;
  return { remote: positional[0], ref: positional[1], depth, force };
}

async function gitMergeCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  const theirs = args.find((arg) => !arg.startsWith("-"));
  const unsupportedArgs = args.filter(
    (arg) => arg.startsWith("-") && arg !== "--ff-only" && arg !== "--no-ff",
  );
  if (!theirs || unsupportedArgs.length > 0)
    return unsupported(["merge", ...args]);
  const result = await git.merge({
    fs,
    dir: cwd,
    theirs,
    fastForwardOnly: args.includes("--ff-only"),
    fastForward: !args.includes("--no-ff"),
    author: { name: "Bunny Agent", email: "bunny-agent@example.com" },
  });
  return success(JSON.stringify(result, null, 2) + "\n");
}

async function gitRemoteCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  if (args.length === 0) {
    const remotes = await git.listRemotes({ fs, dir: cwd });
    return success(
      remotes.map((remote) => remote.remote).join("\n") +
        (remotes.length > 0 ? "\n" : ""),
    );
  }
  if (args[0] === "-v" && args.length === 1) {
    const remotes = await git.listRemotes({ fs, dir: cwd });
    const lines = remotes.flatMap((remote) => [
      `${remote.remote}\t${remote.url} (fetch)`,
      `${remote.remote}\t${remote.url} (push)`,
    ]);
    return success(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
  }
  if (args[0] === "add" && args.length === 3) {
    await git.addRemote({ fs, dir: cwd, remote: args[1], url: args[2] });
    return success();
  }
  if ((args[0] === "remove" || args[0] === "rm") && args.length === 2) {
    await git.deleteRemote({ fs, dir: cwd, remote: args[1] });
    return success();
  }
  return unsupported(["remote", ...args]);
}

async function gitTagCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  if (args.length === 0) {
    const tags = await git.listTags({ fs, dir: cwd });
    return success(tags.join("\n") + (tags.length > 0 ? "\n" : ""));
  }
  if (args.length === 1 && !args[0].startsWith("-")) {
    await git.tag({ fs, dir: cwd, ref: args[0] });
    return success();
  }
  return unsupported(["tag", ...args]);
}

async function gitListFilesCommand(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  if (args.length > 0) return unsupported(["ls-files", ...args]);
  const files = await git.listFiles({ fs, dir: cwd });
  return success(files.join("\n") + (files.length > 0 ? "\n" : ""));
}

export async function gitStatus(state: AppState, body: GitStatusRequest) {
  const root = resolveVolumeRoot(state, body.volume);
  const repo = resolveUnderRoot(root, body.repo);
  const result = await runGit(repo, ["status", "--short", "--branch"]);
  return ok(result);
}

export async function gitExec(state: AppState, body: GitExecRequest) {
  if (!body.args?.length) throw new AppError(400, "args cannot be empty");
  if (!ALLOWED_GIT_COMMANDS.has(body.args[0])) {
    throw new AppError(400, `unsupported git command: ${body.args[0]}`);
  }
  const root = resolveVolumeRoot(state, body.volume);
  const repo = resolveUnderRoot(root, body.repo);
  return ok(await runGit(repo, body.args));
}

export async function gitClone(state: AppState, body: GitCloneRequest) {
  const root = resolveVolumeRoot(state, body.volume);
  const parent = resolveUnderRoot(root, body.repo_parent);
  await ensureDir(parent);

  const dirName =
    body.target_dir ??
    body.url
      .replace(/\/$/, "")
      .split(/[/:]/)
      .pop()!
      .replace(/\.git$/, "");
  const repoPath = resolveUnderRoot(parent, dirName);

  const command = await runGitOperation(async () => {
    await git.clone({
      fs,
      http,
      dir: repoPath,
      url: body.url,
      ref: body.branch,
      depth: body.depth,
      singleBranch: body.branch != null || body.depth != null,
    });
    return success();
  });

  const allFiles =
    command.code === 0
      ? await git.listFiles({ fs, dir: repoPath }).catch(() => [])
      : [];
  const limit = Math.min(body.list_files_limit ?? 200, 5000);

  return ok({
    repo_path: repoPath,
    tracked_files_count: allFiles.length,
    tracked_files: allFiles.slice(0, limit),
    tracked_files_truncated: allFiles.length > limit,
    command,
  });
}

async function runGitOperation(
  operation: () => Promise<GitCommandResult>,
): Promise<GitCommandResult> {
  try {
    return await operation();
  } catch (err) {
    return toCommandResult(err);
  }
}

export async function gitInit(state: AppState, body: GitInitRequest) {
  const root = resolveVolumeRoot(state, body.volume);
  const repo = resolveUnderRoot(root, body.repo);
  await ensureDir(repo);
  return ok(
    await runGit(repo, [
      "init",
      ...(body.initial_branch ? ["-b", body.initial_branch] : []),
    ]),
  );
}

import type { GitRpcRequest, GitCommandKeys } from "../shared/git-types.js";

export async function gitRpc(state: AppState, body: GitRpcRequest<GitCommandKeys>) {
  if (!body.command) {
    throw new AppError(400, "missing git command");
  }

  const fn = git[body.command] as any;
  if (typeof fn !== "function") {
    throw new AppError(400, `unsupported or invalid git command: ${body.command}`);
  }

  const root = resolveVolumeRoot(state, body.volume);
  const dir = resolveUnderRoot(root, body.repo);
  await ensureDir(dir);

  const options = body.options || {};
  const args = {
    ...options,
    fs,
    dir,
    http,
  };

  try {
    const result = await fn(args);
    return ok(result);
  } catch (err: any) {
    throw new AppError(400, err.message || String(err));
  }
}
