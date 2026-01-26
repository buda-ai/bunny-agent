import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ExecOptions, SandboxAdapter, SandboxHandle } from "./types.js";

/**
 * Options for creating a LocalSandbox instance
 */
export interface LocalSandboxOptions {
  /** Base working directory for all operations (defaults to process.cwd()) */
  baseDir?: string;
  /** Whether to isolate each sandbox ID in its own subdirectory (default: true) */
  isolate?: boolean;
  /** Default timeout for commands in milliseconds (default: 60000) */
  defaultTimeout?: number;
  /** Environment variables to pass to all commands */
  env?: Record<string, string>;
  /** Runner command to execute in the sandbox (default: ["sandagent", "run"]) */
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
 * import { LocalSandbox, SandAgent } from "@sandagent/manager";
 *
 * // Use current directory as workspace (no isolation)
 * const sandbox = new LocalSandbox({
 *   baseDir: process.cwd(),
 *   isolate: false,
 * });
 *
 * const agent = new SandAgent({
 *   sandbox,
 *   runner: {
 *     kind: "claude-agent-sdk",
 *     model: "claude-sonnet-4-20250514",
 *   },
 * });
 *
 * // Attach and run commands
 * const handle = await sandbox.attach();
 * const result = await handle.runCommand("ls -la");
 * console.log(result.stdout);
 * ```
 */
export class LocalSandbox implements SandboxAdapter {
  private readonly baseDir: string;
  private readonly isolate: boolean;
  private readonly defaultTimeout: number;
  private readonly env: Record<string, string>;
  private readonly runnerCommand: string[];

  /** Current handle for the sandbox instance */
  private currentHandle: LocalSandboxHandle | null = null;

  constructor(options: LocalSandboxOptions = {}) {
    this.baseDir = options.baseDir ?? process.cwd();
    this.isolate = options.isolate ?? true;
    this.defaultTimeout = options.defaultTimeout ?? 60000;
    this.env = options.env ?? {};
    this.runnerCommand = options.runnerCommand ?? ["sandagent", "run"];
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
   * Returns the current workDir if attached, otherwise the baseDir.
   * Note: When isolate=true, the actual workDir will be baseDir/sandbox-xxx after attach().
   */
  getWorkdir(): string {
    return this.currentHandle?.getWorkdir() ?? this.baseDir;
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

    // Determine the working directory for this sandbox
    // If isolation is enabled, use a unique subdirectory
    const workDir = this.isolate
      ? path.join(
          this.baseDir,
          `sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        )
      : this.baseDir;

    // Create the directory if it doesn't exist
    await fs.mkdir(workDir, { recursive: true });
    console.log(`[LocalSandbox] Created/using directory: ${workDir}`);

    const handle = new LocalSandboxHandle(
      workDir,
      this.defaultTimeout,
      this.env,
    );

    // Store the handle
    this.currentHandle = handle;

    return handle;
  }

  /**
   * Reset the sandbox, clearing the current handle.
   * Next call to attach() will create a new working directory (if isolate is true).
   */
  reset(): void {
    this.currentHandle = null;
  }
}

/**
 * Handle for a local sandbox instance
 */
class LocalSandboxHandle implements SandboxHandle {
  private readonly workDir: string;
  private readonly defaultTimeout: number;
  private readonly env: Record<string, string>;

  constructor(
    workDir: string,
    defaultTimeout: number,
    env: Record<string, string>,
  ) {
    this.workDir = workDir;
    this.defaultTimeout = defaultTimeout;
    this.env = env;
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
    const env = { ...process.env, ...this.env, ...opts.env };

    console.log(`[LocalSandbox] Executing command: ${command.join(" ")}`);
    console.log(`[LocalSandbox] Working directory: ${cwd}`);

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
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => {
        isAborted = true;
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
      });
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
      throw spawnError;
    }

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
        // Collect stderr for error message
        let stderr = "";
        for await (const chunk of child.stderr) {
          stderr += chunk.toString();
        }
        throw new Error(
          `Command exited with code ${exitCode}${stderr ? `\nstderr: ${stderr}` : ""}`,
        );
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
