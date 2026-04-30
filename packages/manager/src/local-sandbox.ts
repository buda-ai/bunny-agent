import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { buildRunnerEnv } from "./env.js";
import { createUnixToolBridge } from "./tool-bridge-unix.js";
import type {
  ExecOptions,
  RemoteTool,
  SandboxAdapter,
  SandboxHandle,
  ToolBridge,
} from "./types.js";

/**
 * Options for creating a LocalSandbox instance
 */
export interface LocalSandboxOptions {
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
 * Local sandbox implementation that runs commands on the local machine.
 *
 * This adapter is useful for:
 * - Development and testing
 * - Running agents locally without cloud dependencies
 * - Quick prototyping
 *
 * Warning: This runs commands directly on your local machine with your user's
 * permissions. Use with caution and only with trusted code.
 *
 * @example
 * ```typescript
 * import { LocalSandbox, BunnyAgent } from "@bunny-agent/manager";
 *
 * // Create sandbox with template
 * const sandbox = new LocalSandbox({
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
export class LocalSandbox implements SandboxAdapter {
  private readonly workdir: string;
  private readonly templatesPath: string | undefined;
  private readonly defaultTimeout: number;
  private readonly env: Record<string, string>;
  private readonly runnerCommand: string[];

  /** Current handle for the sandbox instance */
  private currentHandle: LocalSandboxHandle | null = null;

  constructor(options: LocalSandboxOptions = {}) {
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

      console.log(`[LocalSandbox] Cleared template files: .claude, CLAUDE.md`);
    }

    // Create the directory if it doesn't exist
    await fs.mkdir(workdir, { recursive: true });
    console.log(`[LocalSandbox] Using directory: ${workdir}`);

    // Copy all files from templatesPath to workdir if specified
    if (this.templatesPath) {
      try {
        const stat = await fs.stat(this.templatesPath);
        if (stat.isDirectory()) {
          await this.copyDir(this.templatesPath, workdir);
          console.log(
            `[LocalSandbox] Copied template directory: ${this.templatesPath} -> ${workdir}`,
          );
        } else {
          console.warn(
            `[LocalSandbox] templatesPath is not a directory: ${this.templatesPath}`,
          );
        }
      } catch (err) {
        console.warn(
          `[LocalSandbox] Failed to copy template directory: ${this.templatesPath}`,
          err,
        );
      }
    }

    const handle = new LocalSandboxHandle(
      workdir,
      this.defaultTimeout,
      this.env,
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
   * Open a Unix-domain-socket bridge so the in-sandbox runner can call back
   * into host-side {@link RemoteTool} executors. The runner shares this host's
   * filesystem, so a unix socket on a 0700 dir is the simplest auth boundary.
   */
  async createToolBridge(input: {
    tools: RemoteTool[];
    sessionId?: string;
  }): Promise<{ bridge: ToolBridge; close(): Promise<void> }> {
    return createUnixToolBridge(input);
  }
}

/**
 * Handle for a local sandbox instance
 */
class LocalSandboxHandle implements SandboxHandle {
  private readonly workDir: string;
  private readonly defaultTimeout: number;
  private readonly env: Record<string, string>;
  private readonly _sandboxId: string;

  constructor(
    workDir: string,
    defaultTimeout: number,
    env: Record<string, string>,
  ) {
    this.workDir = workDir;
    this.defaultTimeout = defaultTimeout;
    this.env = env;
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

    console.log(`[LocalSandbox] Executing command: ${command.join(" ")}`);
    console.log(`[LocalSandbox] Working directory: ${cwd}`);
    console.log(
      `[LocalSandbox] ENV AWS_BEARER_TOKEN_BEDROCK: ${env.AWS_BEARER_TOKEN_BEDROCK ? "SET" : "NOT SET"}`,
    );
    console.log(
      `[LocalSandbox] ENV CLAUDE_CODE_USE_BEDROCK: ${env.CLAUDE_CODE_USE_BEDROCK || "NOT SET"}`,
    );
    console.log(
      `[LocalSandbox] ENV ANTHROPIC_API_KEY: ${env.ANTHROPIC_API_KEY ? "SET" : "NOT SET"}`,
    );

    // Ensure the working directory exists
    await fs.mkdir(cwd, { recursive: true });

    const [cmd, ...args] = command;
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
            `[LocalSandbox] Command failed (exit ${exitCode}) stderr:\n${stderr}`,
          );
        } else {
          console.error(
            `[LocalSandbox] Command failed with exit ${exitCode} (no stderr). Run manually to see output: ${command.join(" ")}`,
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
      `[LocalSandbox] Uploading ${files.length} file(s) to ${resolvedTargetDir}`,
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
      console.log(`[LocalSandbox] Wrote file: ${filePath}`);
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
    console.log(`[LocalSandbox] Running command: ${command}`);

    return new Promise((resolve, reject) => {
      // Use sh -c to execute the command
      const child = spawn("sh", ["-c", command], {
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
    console.log(`[LocalSandbox] Cleanup complete for: ${this.workDir}`);
    // Note: We don't delete the directory by default to preserve work
    // Users can manually delete it if needed
  }
}
