import * as fs from "node:fs";
import * as path from "node:path";
import { Daytona, type Sandbox, type VolumeMount } from "@daytonaio/sdk";
import type {
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@sandagent/core";

/**
 * Type alias for VolumeMount configuration
 */
type VolumeConfig = VolumeMount;

/**
 * Options for creating a DaytonaSandbox instance
 */
export interface DaytonaSandboxOptions {
  /** Daytona API key (defaults to DAYTONA_API_KEY env var) */
  apiKey?: string;
  /** Daytona API URL (defaults to DAYTONA_API_URL env var) */
  apiUrl?: string;
  /** Timeout in seconds (0 means no timeout, default is 60) */
  timeout?: number;
  /** Path to runner bundle.js (required for running sandagent) */
  runnerBundlePath?: string;
  /** Path to template directory to upload */
  templatesPath?: string;
  /** Volume name for persistence (will be created if not exists) */
  volumeName?: string;
  /** Mount path for the volume (default: /sandagent) */
  volumeMountPath?: string;
  /**
   * Auto-stop interval in minutes (0 means disabled).
   * Default is 15 minutes.
   * The sandbox will automatically stop after being idle for this duration.
   */
  autoStopInterval?: number;
  /**
   * Auto-delete interval in minutes.
   * - Negative value: disabled (default)
   * - 0: delete immediately upon stopping
   * - Positive value: delete after being stopped for this many minutes
   */
  autoDeleteInterval?: number;
  /**
   * Sandbox name for reuse.
   * If provided, will try to get existing sandbox by name first.
   * If not found, creates a new sandbox with this name.
   * If not provided, a new sandbox is always created (without a name).
   */
  name?: string;

  /**
   * Environment variables to set in the sandbox.
   * These will be available to all commands executed in the sandbox.
   */
  env?: Record<string, string>;

  /**
   * Agent template to use (e.g., "default", "coder", "analyst", "researcher").
   *
   * @default 'default'
   */
  agentTemplate?: string;

  /**
   * Working directory for the agent inside the sandbox.
   * Will be created if it doesn't exist.
   *
   * @default '/workspace'
   */
  workdir?: string;
}

/**
 * Daytona-based sandbox implementation.
 *
 * This adapter supports sandbox reuse based on sandbox name.
 * When a name is provided, it will attempt to get an existing sandbox
 * by that name first. If not found, creates a new sandbox with that name.
 * If no name is provided, a new sandbox is always created.
 */
export class DaytonaSandbox implements SandboxAdapter {
  private readonly apiKey?: string;
  private readonly apiUrl?: string;
  private readonly timeout: number;
  private readonly runnerBundlePath?: string;
  private readonly templatesPath?: string;
  private readonly volumeName?: string;
  private readonly volumeMountPath: string;
  private readonly autoStopInterval: number;
  private readonly autoDeleteInterval: number;
  private readonly name?: string;
  private readonly env: Record<string, string>;
  private readonly agentTemplate: string;
  private readonly workdir: string;

  constructor(options: DaytonaSandboxOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DAYTONA_API_KEY;
    this.apiUrl = options.apiUrl ?? process.env.DAYTONA_API_URL;
    this.timeout = options.timeout ?? 0;
    this.runnerBundlePath = options.runnerBundlePath;
    this.templatesPath = options.templatesPath;
    this.volumeName = options.volumeName;
    this.volumeMountPath = options.volumeMountPath ?? "/sandagent";
    // Default auto-stop to 15 minutes
    this.autoStopInterval = options.autoStopInterval ?? 15;
    // Default auto-delete to disabled (-1),
    this.autoDeleteInterval = options.autoDeleteInterval ?? 0;
    this.name = options.name;
    this.env = options.env ?? {};
    this.agentTemplate = options.agentTemplate ?? "default";
    this.workdir = options.workdir ?? "/workspace";
  }

  /**
   * Get the environment variables configured for this sandbox.
   */
  getEnv(): Record<string, string> {
    return this.env;
  }

  /**
   * Get the agent template configured for this sandbox.
   */
  getAgentTemplate(): string {
    return this.agentTemplate;
  }

  /**
   * Get the working directory configured for this sandbox.
   */
  getWorkdir(): string {
    return this.workdir;
  }

  async attach(): Promise<SandboxHandle> {
    if (!this.apiKey) {
      throw new Error(
        "Daytona API key not found. Please set DAYTONA_API_KEY environment variable or pass apiKey option.",
      );
    }

    const daytona = new Daytona({
      apiKey: this.apiKey,
      apiUrl: this.apiUrl,
    });

    console.log(`[Daytona] Attaching sandbox`);

    // Get or create volume if volumeName is provided
    let volumes: VolumeConfig[] | undefined;
    if (this.volumeName) {
      console.log(`[Daytona] Getting/creating volume: ${this.volumeName}`);
      let volume = await daytona.volume.get(this.volumeName, true);

      // Wait for volume to be ready
      const maxWaitMs = 30000;
      const startTime = Date.now();
      while (volume.state !== "ready" && Date.now() - startTime < maxWaitMs) {
        console.log(`[Daytona] Volume state: ${volume.state}, waiting...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        volume = await daytona.volume.get(this.volumeName, false);
      }

      if (volume.state !== "ready") {
        throw new Error(
          `Volume '${this.volumeName}' failed to become ready. State: ${volume.state}`,
        );
      }

      volumes = [{ volumeId: volume.id, mountPath: this.volumeMountPath }];
      console.log(
        `[Daytona] Using volume ${volume.id} at ${this.volumeMountPath}`,
      );
    }

    let sandbox: Sandbox;
    let needsInit = false;

    // Try to get existing sandbox by name
    if (this.name) {
      console.log(
        `[Daytona] Looking for existing sandbox with name: ${this.name}`,
      );

      try {
        const existingSandbox = await daytona.get(this.name);
        console.log(
          `[Daytona] Found existing sandbox: ${existingSandbox.id}, state: ${existingSandbox.state}`,
        );

        // Handle different sandbox states
        if (existingSandbox.state === "started") {
          // Sandbox is ready to use
          console.log(
            `[Daytona] Reusing running sandbox: ${existingSandbox.id}`,
          );
          sandbox = existingSandbox;
          // Refresh activity to prevent auto-stop
          await sandbox.refreshActivity();
        } else if (
          existingSandbox.state === "stopped" ||
          existingSandbox.state === "stopping"
        ) {
          // Sandbox needs to be started
          console.log(
            `[Daytona] Starting stopped sandbox: ${existingSandbox.id}`,
          );
          await existingSandbox.start(this.timeout);
          sandbox = existingSandbox;
        } else if (existingSandbox.state === "archived") {
          // Archived sandbox - start it (Daytona will unarchive automatically)
          console.log(
            `[Daytona] Starting archived sandbox: ${existingSandbox.id}`,
          );
          await existingSandbox.start(this.timeout);
          sandbox = existingSandbox;
        } else if (existingSandbox.state === "error") {
          // Error state - check if recoverable
          if (existingSandbox.recoverable) {
            console.log(
              `[Daytona] Recovering sandbox from error: ${existingSandbox.id}`,
            );
            await existingSandbox.recover(this.timeout);
            sandbox = existingSandbox;
          } else {
            // Non-recoverable error - delete and create new
            console.log(
              `[Daytona] Deleting non-recoverable sandbox: ${existingSandbox.id}`,
            );
            await existingSandbox.delete();
            sandbox = await this.createNewSandbox(daytona, volumes);
            needsInit = true;
          }
        } else if (existingSandbox.state === "starting") {
          // Wait for it to finish starting
          console.log(
            `[Daytona] Waiting for sandbox to start: ${existingSandbox.id}`,
          );
          await existingSandbox.waitUntilStarted(this.timeout);
          sandbox = existingSandbox;
        } else {
          // Unknown state - create new sandbox
          console.log(
            `[Daytona] Unknown sandbox state: ${existingSandbox.state}, creating new sandbox`,
          );
          sandbox = await this.createNewSandbox(daytona, volumes);
          needsInit = true;
        }

        // If sandbox exists, it's already initialized (files are in volume)
        // Only initialize if we're creating a new sandbox
      } catch (error) {
        // get() throws if not found, create new sandbox with the name
        console.log(
          `[Daytona] Sandbox "${this.name}" not found, creating new one`,
        );
        sandbox = await this.createNewSandbox(daytona, volumes);
        needsInit = true;
      }
    } else {
      // No name provided - always create new sandbox
      console.log(`[Daytona] No name provided, creating new sandbox`);
      sandbox = await this.createNewSandbox(daytona, volumes);
      needsInit = true;
    }

    console.log(`[Daytona] Sandbox ${sandbox.id} ready`);

    const handle = new DaytonaHandle(sandbox, this.env);

    // Initialize sandbox if needed (upload files, install dependencies)
    // Files are stored in volume, so existing sandboxes don't need re-initialization
    if (needsInit) {
      await this.initializeSandbox(handle);
    }

    return handle;
  }

  /**
   * Create a new sandbox with the configured settings
   */
  private async createNewSandbox(
    daytona: Daytona,
    volumes?: VolumeConfig[],
  ): Promise<Sandbox> {
    console.log(
      `[Daytona] Creating new sandbox${this.name ? ` with name "${this.name}"` : ""}, autoStopInterval=${this.autoStopInterval}min, autoDeleteInterval=${this.autoDeleteInterval}min`,
    );

    const sandbox = await daytona.create(
      {
        name: this.name,
        language: "typescript",
        volumes,
        autoStopInterval: this.autoStopInterval,
        autoDeleteInterval: this.autoDeleteInterval,
      },
      { timeout: this.timeout },
    );
    await sandbox.start();

    console.log(`[Daytona] Sandbox ${sandbox.id} created and started`);
    return sandbox;
  }

  private async initializeSandbox(handle: DaytonaHandle): Promise<void> {
    // Upload runner bundle to /sandagent (fixed location for node to find it)
    if (this.runnerBundlePath && fs.existsSync(this.runnerBundlePath)) {
      const bundleContent = fs.readFileSync(this.runnerBundlePath);
      const bundleFileName = path.basename(this.runnerBundlePath);
      const runnerFiles = [
        {
          path: `runner/${bundleFileName}`,
          content: bundleContent,
        },
      ];
      console.log(
        `[Daytona] Uploading runner bundle (${bundleFileName}) to /sandagent`,
      );
      await handle.upload(runnerFiles, "/sandagent");

      console.log(
        `[Daytona] Installing @anthropic-ai/claude-agent-sdk`,
      );
      const installResult = await handle.runCommand(
        "npm install --prefix /sandagent @anthropic-ai/claude-agent-sdk",
      );
      if (installResult.exitCode !== 0) {
        console.error(
          `[Daytona] Failed to install claude-agent-sdk: ${installResult.stderr}`,
        );
      }
    }

    // Upload template to workdir (where runner will execute)
    if (this.templatesPath && fs.existsSync(this.templatesPath)) {
      const templateFiles = this.collectFiles(this.templatesPath, "");
      console.log(
        `[Daytona] Uploading ${templateFiles.length} template files to ${this.workdir}`,
      );
      await handle.upload(templateFiles, this.workdir);
    }
  }

  private collectFiles(
    dir: string,
    prefix: string,
  ): Array<{ path: string; content: Uint8Array | string }> {
    const files: Array<{ path: string; content: Uint8Array | string }> = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") {
          continue;
        }
        files.push(...this.collectFiles(fullPath, relativePath));
      } else if (entry.isFile()) {
        files.push({
          path: relativePath,
          content: fs.readFileSync(fullPath),
        });
      }
    }

    return files;
  }
}

/**
 * Handle for an active Daytona sandbox
 */
class DaytonaHandle implements SandboxHandle {
  private readonly sandbox: Sandbox;
  private readonly sandboxEnv: Record<string, string>;

  constructor(sandbox: Sandbox, sandboxEnv: Record<string, string> = {}) {
    this.sandbox = sandbox;
    this.sandboxEnv = sandboxEnv;
  }

  /**
   * Get the sandbox ID (useful for external tracking)
   */
  getSandboxId(): string {
    return this.sandbox.id;
  }

  /**
   * Escape a string for safe use in shell commands
   * Uses single quotes and escapes any single quotes within the string
   */
  private shellEscape(arg: string): string {
    // If the argument contains no special characters, return as-is
    if (/^[a-zA-Z0-9._\-\/=]+$/.test(arg)) {
      return arg;
    }
    // Wrap in single quotes and escape any single quotes within
    // Replace ' with '\'' (end quote, escaped quote, start quote)
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  /**
   * Build a shell-safe command string from an array of arguments
   */
  private buildShellCommand(command: string[]): string {
    return command.map((arg) => this.shellEscape(arg)).join(" ");
  }

  /**
   * Run a command and wait for completion (used internally)
   */
  async runCommand(
    cmd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const result = await this.sandbox.process.executeCommand(cmd);
    return {
      exitCode: result.exitCode,
      stdout: result.result || "",
      stderr: "",
    };
  }

  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array> {
    const sandbox = this.sandbox;
    const signal = opts?.signal;

    // Merge sandbox-level env with call-level env (call-level takes precedence)
    // Add NODE_PATH so Node can find packages installed in /sandagent
    const envWithNodePath: Record<string, string> = {
      ...this.sandboxEnv,
      ...opts?.env,
      NODE_PATH: "/sandagent/node_modules",
    };

    // Build environment exports for shell
    const envExports = Object.entries(envWithNodePath)
      .map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
      .join("; ");

    // Build shell-safe command string with proper escaping
    const baseCommand = this.buildShellCommand(command);
    const shellCommand = `${envExports}; ${baseCommand}`;

    // Debug: log environment variables being passed to sandbox
    console.log("[Daytona] Executing command:", shellCommand);
    console.log(
      "[Daytona] Environment variables:",
      Object.keys(envWithNodePath),
    );
    console.log(
      "[Daytona] ANTHROPIC_API_KEY present:",
      !!envWithNodePath.ANTHROPIC_API_KEY,
    );
    if (envWithNodePath.ANTHROPIC_API_KEY) {
      console.log(
        "[Daytona] ANTHROPIC_API_KEY prefix:",
        envWithNodePath.ANTHROPIC_API_KEY.substring(0, 10) + "...",
      );
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log("[Daytona] Session ID:", sessionId);

    return {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        const chunks: Uint8Array[] = [];
        let finished = false;
        let error: Error | null = null;
        let resolveNext: (() => void) | null = null;

        // Monitor abort signal and kill the session
        const abortHandler = async () => {
          console.log(
            "[Daytona] Abort signal received, terminating session...",
          );
          console.log("[Daytona] Session ID:", sessionId);

          finished = true;
          error = new Error("Operation aborted");
          error.name = "AbortError";

          // Kill the session directly
          try {
            await sandbox.process.deleteSession(sessionId);
            console.log("[Daytona] Session deleted successfully");
          } catch (err) {
            console.error("[Daytona] Failed to delete session:", err);
          }

          if (resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        };

        if (signal) {
          console.log("[Daytona] Adding abort signal listener");
          signal.addEventListener("abort", abortHandler);
        } else {
          console.log("[Daytona] No signal provided");
        }

        // Start async execution
        (async () => {
          try {
            // Create session first
            await sandbox.process.createSession(sessionId);

            const result = await sandbox.process.executeSessionCommand(
              sessionId,
              { command: shellCommand, runAsync: true },
            );

            if (!result.cmdId) {
              throw new Error("No command ID returned from async execution");
            }

            console.log("[Daytona] Command started, cmdId:", result.cmdId);

            await sandbox.process.getSessionCommandLogs(
              sessionId,
              result.cmdId,
              (chunk: string) => {
                console.log("[Daytona] stdout:", chunk);
                chunks.push(new TextEncoder().encode(chunk));
                if (resolveNext) {
                  resolveNext();
                  resolveNext = null;
                }
              },
              (chunk: string) => {
                console.log("[Daytona] stderr:", chunk);
              },
            );

            console.log("[Daytona] Command completed");
            finished = true;
            if (resolveNext) {
              (resolveNext as () => void)();
              resolveNext = null;
            }
          } catch (err) {
            error = err instanceof Error ? err : new Error(String(err));
            if (error.name === "AbortError") {
              console.log("[Daytona] Command execution aborted by user");
            } else {
              console.error(
                "[Daytona] Command execution error:",
                error.message,
              );
            }
            if (resolveNext) {
              (resolveNext as () => void)();
              resolveNext = null;
            }
          } finally {
            // Cleanup session
            sandbox.process.deleteSession(sessionId).catch(() => {
              // Ignore cleanup errors
            });
            // Remove event listener when iterator completes
            if (signal) {
              signal.removeEventListener("abort", abortHandler);
            }
          }
        })();

        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            while (true) {
              // Check if signal is aborted and no more chunks
              if (signal?.aborted && chunks.length === 0) {
                console.log("[Daytona] Signal aborted, stopping iteration");
                return { value: undefined, done: true };
              }

              if (chunks.length > 0) {
                return { value: chunks.shift()!, done: false };
              }

              if (finished) {
                return { value: undefined, done: true };
              }

              if (error) {
                throw error;
              }

              // Wait for next chunk
              await new Promise<void>((resolve) => {
                resolveNext = resolve;
              });
            }
          },
        };
      },
    };
  }

  async upload(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string,
  ): Promise<void> {
    // Batch upload all files
    const filesToUpload = files.map((file) => ({
      source:
        file.content instanceof Uint8Array
          ? Buffer.from(file.content)
          : Buffer.from(file.content, "utf-8"),
      destination: `${targetDir}/${file.path}`,
    }));

    // Use longer timeout (300s) for large file uploads
    await this.sandbox.fs.uploadFiles(filesToUpload, 300);
  }

  async destroy(): Promise<void> {
    // Daytona sandbox lifecycle is managed by the platform, no manual cleanup needed
    // The sandbox will auto-stop and auto-delete based on configured intervals
  }
}
