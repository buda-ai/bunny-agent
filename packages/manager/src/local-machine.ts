import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { buildRunnerEnv } from "./env.js";
import type { ExecOptions, SandboxAdapter, SandboxHandle } from "./types.js";

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
 * import { LocalMachine, BunnyAgent } from "@bunny-agent/manager";
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

  constructor(
    workDir: string,
    defaultTimeout: number,
    env: Record<string, string>,
    label = "LocalMachine",
    transformCommand: (command: string[]) => Promise<string[]> = async (
      command,
    ) => command,
  ) {
    this.workDir = workDir;
    this.defaultTimeout = defaultTimeout;
    this.env = env;
    this.label = label;
    this.transformCommand = transformCommand;
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
    const baseInherit = { ...process.env, ...this.env, ...opts.env };
    const env = buildRunnerEnv({
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
    });

    let timeoutId: NodeJS.Timeout | undefined;
    let isTimedOut = false;
    let isAborted = false;

    // Set up timeout if specified
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        isTimedOut = true;
        child.kill("SIGTERM");
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
      }, timeout);
    }

    // Set up abort signal if provided
    const abortHandler = () => {
      isAborted = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 5000);
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
        child.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.on("close", () => {
        clearTimeout(timeoutId);
      });
    });
  }

  async destroy(): Promise<void> {
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
