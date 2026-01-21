import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@sandagent/manager";

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
 */
export class LocalSandbox implements SandboxAdapter {
  private readonly baseDir: string;
  private readonly isolate: boolean;
  private readonly defaultTimeout: number;
  private readonly env: Record<string, string>;

  constructor(options: LocalSandboxOptions = {}) {
    this.baseDir = options.baseDir ?? process.cwd();
    this.isolate = options.isolate ?? true;
    this.defaultTimeout = options.defaultTimeout ?? 60000;
    this.env = options.env ?? {};
  }

  async attach(id: string): Promise<SandboxHandle> {
    // Determine the working directory for this sandbox
    const workDir = this.isolate ? path.join(this.baseDir, id) : this.baseDir;

    // Create the directory if it doesn't exist
    await fs.mkdir(workDir, { recursive: true });

    console.log(`[LocalSandbox] Created/using directory: ${workDir}`);

    return new LocalSandboxHandle(workDir, this.defaultTimeout, this.env);
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
    files: Array<{ path: string; content: Uint8Array | string }>,
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

  /**
   * Execute a command and wait for completion, returning stdout, stderr, and exit code
   */
  async runCommand(command: string): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
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
