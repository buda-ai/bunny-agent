import { type ChildProcess, execFile, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  buildRunnerEnv,
  type ExecOptions,
  type SandboxAdapter,
  type SandboxHandle,
} from "@bunny-agent/manager";

/**
 * Kill an entire process tree, not just the direct child.
 *
 * A plain `child.kill(signal)` only signals the direct child PID. If that
 * child forks/backgrounds its own children (e.g. a shell's `cmd &`, or a
 * coding-agent CLI spawning a tool subprocess), those grandchildren are NOT
 * part of a process group we control and survive as orphans — a real
 * resource leak on abort/timeout that plain `LocalMachine` (no isolation)
 * has no other protection against. (`SrtSandbox` doesn't need this: srt's
 * bwrap wrapping passes `--unshare-pid`, so the kernel tears down every
 * process in that PID namespace the instant its init dies — confirmed by a
 * live repro that leaves an orphan under `LocalMachine` but reaps it clean
 * under `SrtSandbox`.)
 *
 * Requires the child to have been spawned with `detached: true` on POSIX
 * (making `child.pid` the process-group leader, so `process.kill(-pid, …)`
 * signals the whole group). On Windows, `taskkill /T` walks the tree
 * instead — Node's negative-PID group-signal trick is POSIX-only.
 */
function killProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) {
    return;
  }
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {
      // Best-effort: nothing to recover into if taskkill itself is missing
      // or the tree is already gone.
    });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    // ESRCH (already exited) or the child wasn't actually a group leader
    // (e.g. spawn failed before detached took effect) — fall back to
    // signaling just the direct child so a live process still gets it.
    child.kill(signal);
  }
}

/**
 * Options for creating a LocalMachine instance
 */
export interface LocalMachineOptions {
  /** Working directory for all operations (defaults to process.cwd()) */
  workdir?: string;
  /** Path to the agent template directory to copy into the sandbox workdir */
  templatesPath?: string;
  /** Default timeout for commands in milliseconds (default: 300000 = 5 min) */
  defaultTimeout?: number;
  /** Environment variables to pass to all commands */
  env?: Record<string, string>;
  /** Runner command to execute in the sandbox (default: ["bunny-agent", "run"]) */
  runnerCommand?: string[];
}

/**
 * Runs commands directly on the local machine — with NO isolation.
 *
 * This adapter is useful for:
 * - Development and testing
 * - Running agents locally without cloud dependencies
 * - Quick prototyping
 *
 * Warning: commands run directly on your local machine with your user's
 * permissions — there is no sandbox here. Use with caution and only with
 * trusted code. For actual OS-level isolation on the local machine, use
 * `SrtSandbox` (same API, wraps every command with
 * `@anthropic-ai/sandbox-runtime`).
 *
 * Note: this class was previously (mis)named `LocalSandbox`; that name is
 * still exported as a deprecated alias.
 *
 * @example
 * ```typescript
 * import { BunnyAgent } from "@bunny-agent/manager";
 * import { LocalMachine } from "@bunny-agent/sandbox-local";
 *
 * // Create sandbox with template
 * const sandbox = new LocalMachine({
 *   workdir: "/tmp/my-sandbox",
 *   templatesPath: "/path/to/agent-template",
 * });
 *
 * const agent = new BunnyAgent({
 *   sandbox,
 *   runner: {
 *     model: "claude-sonnet-4-20250514",
 *   },
 * });
 *
 * // Attach copies template files to workdir and returns handle
 * const handle = await sandbox.attach();
 * const result = await handle.runCommand("ls -la");
 * console.log(result.stdout);
 * ```
 */
export class LocalMachine implements SandboxAdapter {
  /** Log prefix; subclasses override so their logs are attributable. */
  protected readonly label: string = "LocalMachine";

  private readonly workdir: string;
  private readonly templatesPath: string | undefined;
  private readonly defaultTimeout: number;
  private readonly env: Record<string, string>;
  private readonly runnerCommand: string[];

  /** Current handle for the sandbox instance */
  private currentHandle: LocalMachineHandle | null = null;

  constructor(options: LocalMachineOptions = {}) {
    this.workdir = options.workdir ?? process.cwd();
    this.templatesPath = options.templatesPath;
    this.defaultTimeout = options.defaultTimeout ?? 300000; // 5 min for agent runs
    this.env = options.env ?? {};
    this.runnerCommand = options.runnerCommand ?? ["bunny-agent", "run"];
  }

  getHandle(): SandboxHandle | null {
    return this.currentHandle;
  }

  /**
   * Get the environment variables configured for this sandbox.
   */
  getEnv(): Record<string, string> {
    return { ...this.env };
  }

  /**
   * Get the working directory configured for this sandbox.
   */
  getWorkdir(): string {
    return this.currentHandle?.getWorkdir() ?? this.workdir;
  }

  /**
   * Get the runner command to execute in the sandbox.
   */
  getRunnerCommand(): string[] {
    return [...this.runnerCommand];
  }

  async attach(): Promise<SandboxHandle> {
    // Return existing handle if already attached
    if (this.currentHandle) {
      return this.currentHandle;
    }

    // Use workdir as the working directory
    const workdir = this.workdir;

    // Clear template files before copying (only .claude dir and CLAUDE.md)
    if (this.templatesPath) {
      const claudeDir = path.join(workdir, ".claude");
      const claudeMd = path.join(workdir, "CLAUDE.md");

      await fs.rm(claudeDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(claudeMd, { force: true }).catch(() => {});

      console.log(`[${this.label}] Cleared template files: .claude, CLAUDE.md`);
    }

    // Create the directory if it doesn't exist
    await fs.mkdir(workdir, { recursive: true });
    console.log(`[${this.label}] Using directory: ${workdir}`);

    // Copy all files from templatesPath to workdir if specified
    if (this.templatesPath) {
      try {
        const stat = await fs.stat(this.templatesPath);
        if (stat.isDirectory()) {
          await this.copyDir(this.templatesPath, workdir);
          console.log(
            `[${this.label}] Copied template directory: ${this.templatesPath} -> ${workdir}`,
          );
        } else {
          console.warn(
            `[${this.label}] templatesPath is not a directory: ${this.templatesPath}`,
          );
        }
      } catch (err) {
        console.warn(
          `[${this.label}] Failed to copy template directory: ${this.templatesPath}`,
          err,
        );
      }
    }

    const handle = new LocalMachineHandle(
      workdir,
      this.defaultTimeout,
      this.env,
      this.label,
      (command) => this.transformCommand(command),
      () => this.onDestroy(),
    );

    // Store the handle
    this.currentHandle = handle;

    return handle;
  }

  /**
   * Recursively copy a directory
   */
  private async copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Reset the sandbox, clearing the current handle.
   */
  reset(): void {
    this.currentHandle = null;
  }

  /**
   * Hook for subclasses to rewrite a command before it is spawned (e.g.
   * prefixing it with a sandboxing wrapper). The base implementation is the
   * identity — commands run as-is on the host.
   */
  protected async transformCommand(command: string[]): Promise<string[]> {
    return command;
  }

  /**
   * Hook for subclasses to release resources they allocated outside the
   * handle (e.g. a generated policy file) when the handle is destroyed. The
   * base implementation is a no-op.
   */
  protected async onDestroy(): Promise<void> {}
}

/**
 * Handle for a local sandbox instance
 */
class LocalMachineHandle implements SandboxHandle {
  private readonly workDir: string;
  private readonly defaultTimeout: number;
  private readonly env: Record<string, string>;
  private readonly _sandboxId: string;
  private readonly label: string;
  private readonly transformCommand: (command: string[]) => Promise<string[]>;
  private readonly onDestroyHook: () => Promise<void>;

  constructor(
    workDir: string,
    defaultTimeout: number,
    env: Record<string, string>,
    label = "LocalMachine",
    transformCommand: (command: string[]) => Promise<string[]> = async (
      command,
    ) => command,
    onDestroyHook: () => Promise<void> = async () => {},
  ) {
    this.workDir = workDir;
    this.defaultTimeout = defaultTimeout;
    this.env = env;
    this.label = label;
    this.transformCommand = transformCommand;
    this.onDestroyHook = onDestroyHook;
    this._sandboxId = `local-${crypto.randomUUID()}`;
  }

  /**
   * Get the sandbox instance ID.
   */
  getSandboxId(): string {
    return this._sandboxId;
  }

  /**
   * Local sandbox has no volumes.
   */
  getVolumes(): null {
    return null;
  }

  /**
   * Get the working directory for this sandbox handle
   */
  getWorkdir(): string {
    return this.workDir;
  }

  async *exec(
    command: string[],
    opts: ExecOptions = {},
  ): AsyncIterable<Uint8Array> {
    if (command.length === 0) {
      throw new Error("Command cannot be empty");
    }

    const cwd = opts.cwd ? path.resolve(this.workDir, opts.cwd) : this.workDir;
    const timeout = opts.timeout ?? this.defaultTimeout;
    const explicitEnv = { ...this.env, ...opts.env };
    const baseInherit = { ...process.env, ...explicitEnv };
    const env = buildRunnerEnv({
      BRAVE_API_KEY: explicitEnv.BRAVE_API_KEY,
      TAVILY_API_KEY: explicitEnv.TAVILY_API_KEY,
      inherit: baseInherit,
    });

    const finalCommand = await this.transformCommand(command);

    console.log(`[${this.label}] Executing command: ${finalCommand.join(" ")}`);
    console.log(`[${this.label}] Working directory: ${cwd}`);
    console.log(
      `[${this.label}] ENV AWS_BEARER_TOKEN_BEDROCK: ${env.AWS_BEARER_TOKEN_BEDROCK ? "SET" : "NOT SET"}`,
    );
    console.log(
      `[${this.label}] ENV CLAUDE_CODE_USE_BEDROCK: ${env.CLAUDE_CODE_USE_BEDROCK || "NOT SET"}`,
    );
    console.log(
      `[${this.label}] ENV ANTHROPIC_API_KEY: ${env.ANTHROPIC_API_KEY ? "SET" : "NOT SET"}`,
    );

    // Ensure the working directory exists
    await fs.mkdir(cwd, { recursive: true });

    const [cmd, ...args] = finalCommand;
    const child = spawn(cmd, args, {
      cwd,
      env,
      shell: false,
      // Makes `child.pid` the leader of its own process group on POSIX, so
      // killProcessTree() can signal the whole tree (including backgrounded
      // grandchildren) instead of just this direct child.
      detached: process.platform !== "win32",
    });

    // Tracks real process exit — NOT the same as child.killed, which Node
    // sets true as soon as a kill() signal is successfully *sent*, whether
    // or not the process actually died. Using child.killed to decide
    // whether to escalate to SIGKILL (the pre-existing logic here) meant
    // the escalation almost never fired, because killed flips true right
    // after the SIGTERM call succeeds — before the process has had any
    // chance to exit.
    let hasExited = false;
    child.once("exit", () => {
      hasExited = true;
    });

    const escalateToSigkill = () => {
      setTimeout(() => {
        if (!hasExited) {
          killProcessTree(child, "SIGKILL");
        }
      }, 5000);
    };

    let timeoutId: NodeJS.Timeout | undefined;
    let isTimedOut = false;
    let isAborted = false;

    // Set up timeout if specified
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        isTimedOut = true;
        killProcessTree(child, "SIGTERM");
        escalateToSigkill();
      }, timeout);
    }

    // Set up abort signal if provided
    const abortHandler = () => {
      isAborted = true;
      killProcessTree(child, "SIGTERM");
      escalateToSigkill();
    };

    if (opts.signal) {
      opts.signal.addEventListener("abort", abortHandler);
    }

    // Handle spawn errors (e.g., command not found)
    const spawnError = await new Promise<Error | null>((resolve) => {
      child.once("error", resolve);
      child.once("spawn", () => resolve(null));
    });

    if (spawnError) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (opts.signal) {
        opts.signal.removeEventListener("abort", abortHandler);
      }
      throw spawnError;
    }

    // Buffer stderr for error reporting; also mirror to the parent process so
    // subprocess diagnostics (e.g. [bunny-agent:pi] skill load) are visible on success.
    const stderrChunks: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    });

    try {
      // Yield stdout chunks
      for await (const chunk of child.stdout) {
        yield chunk;
      }

      // Wait for the process to complete
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? 0));
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (isAborted) {
        throw new Error("Command was aborted");
      }

      if (isTimedOut) {
        throw new Error(`Command timed out after ${timeout}ms`);
      }

      if (exitCode !== 0) {
        const stderr = stderrChunks.length
          ? Buffer.concat(stderrChunks).toString("utf-8").trim()
          : "";
        if (stderr) {
          console.error(
            `[${this.label}] Command failed (exit ${exitCode}) stderr:\n${stderr}`,
          );
        } else {
          console.error(
            `[${this.label}] Command failed with exit ${exitCode} (no stderr). Run manually to see output: ${finalCommand.join(" ")}`,
          );
        }
        // User-facing message: show the actual error from stderr (where it failed)
        const lines = stderr
          .split(/\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const lastLine = lines.length > 0 ? lines[lines.length - 1] : "";
        const hasErrorLike = (s: string) =>
          /error|Error|Fatal|TypeError|SyntaxError|Exception/i.test(s);
        const errorLine = lines.filter(hasErrorLike).pop() ?? lastLine;
        const userMessage = errorLine
          ? errorLine.replace(/\s+/g, " ").slice(0, 500)
          : stderr
            ? `Command failed (exit ${exitCode}). See server logs for stderr.`
            : `Command failed with exit ${exitCode}.`;
        throw new Error(userMessage);
      }
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw error;
    }
  }

  async upload(
    files: Array<{ path: string; content: string | Uint8Array }>,
    targetDir: string,
  ): Promise<void> {
    const resolvedTargetDir = path.resolve(this.workDir, targetDir);
    console.log(
      `[${this.label}] Uploading ${files.length} file(s) to ${resolvedTargetDir}`,
    );

    // Create target directory
    await fs.mkdir(resolvedTargetDir, { recursive: true });

    // Write each file
    for (const file of files) {
      const filePath = path.join(resolvedTargetDir, file.path);
      const fileDir = path.dirname(filePath);

      // Ensure the file's directory exists
      await fs.mkdir(fileDir, { recursive: true });

      // Write the file
      const content =
        typeof file.content === "string"
          ? Buffer.from(file.content, "utf-8")
          : file.content;

      await fs.writeFile(filePath, content);
      console.log(`[${this.label}] Wrote file: ${filePath}`);
    }
  }

  async readFile(filePath: string): Promise<string> {
    const resolvedPath = path.resolve(this.workDir, filePath);
    const content = await fs.readFile(resolvedPath, "utf-8");
    return content;
  }

  /**
   * Execute a command and wait for completion, returning stdout, stderr, and exit code
   */
  async runCommand(
    command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    console.log(`[${this.label}] Running command: ${command}`);

    // Route through the same transform hook as exec() so subclasses that
    // wrap commands (e.g. with a sandboxing wrapper) cover this path too.
    const [cmd, ...args] = await this.transformCommand(["sh", "-c", command]);

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: this.workDir,
        env: { ...process.env, ...this.env }, // Use instance env
        stdio: "pipe",
        // See killProcessTree()'s doc comment (above, in exec()'s spawn):
        // needed so a timeout can reap backgrounded grandchildren too.
        detached: process.platform !== "win32",
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      child.on("error", reject);

      // Timeout handling
      const timeout = this.defaultTimeout;
      const timeoutId = setTimeout(() => {
        killProcessTree(child, "SIGTERM");
        setTimeout(() => killProcessTree(child, "SIGKILL"), 5000);
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.on("close", () => {
        clearTimeout(timeoutId);
      });
    });
  }

  async destroy(): Promise<void> {
    await this.onDestroyHook();
    console.log(`[${this.label}] Cleanup complete for: ${this.workDir}`);
    // Note: We don't delete the directory by default to preserve work
    // Users can manually delete it if needed
  }
}

/**
 * @deprecated Renamed to {@link LocalMachine} — this adapter provides NO
 * isolation (commands run directly on the host with your user's permissions),
 * so the "sandbox" name was misleading. For actual OS-level local isolation,
 * use `SrtSandbox`. This alias will be removed in the next major version.
 */
export const LocalSandbox = LocalMachine;
/** @deprecated Renamed to {@link LocalMachine}. */
export type LocalSandbox = LocalMachine;
/** @deprecated Renamed to {@link LocalMachineOptions}. */
export type LocalSandboxOptions = LocalMachineOptions;
