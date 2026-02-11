import * as fs from "node:fs";
import * as path from "node:path";
import { noDeprecation } from "node:process";
import type {
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
  Volume,
} from "@sandagent/manager";
import { type SandockClient, createSandockClient } from "sandock";

/** Single volume mount configuration (name → get/create by name; mountPath inside container) */
export interface SandockVolumeConfig {
  /** Volume name for persistence (will be created if not exists) */
  volumeName: string;
  /** Mount path inside the sandbox */
  volumeMountPath: string;
}

/**
 * Options for creating a SandockSandbox instance
 */
export interface SandockSandboxOptions {
  /** Sandock API base URL (defaults to https://sandock.ai) */
  baseUrl?: string;
  /** Sandock API key for authentication */
  apiKey?: string;
  /** Docker image to use for the sandbox */
  image?: string;
  /** Working directory inside the sandbox */
  workdir?: string;
  /** Memory limit in MB */
  memoryLimitMb?: number;
  /** CPU shares */
  cpuShares?: number;
  /**
   * If true (default), keep sandbox running after execution (platform may retain it for e.g. 30 minutes).
   * If false, sandbox is stopped and deleted after the command finishes.
   */
  keep?: boolean;
  /** Timeout for sandbox operations in milliseconds (default: 300000 = 5 min) */
  timeout?: number;
  /** Path to template directory to upload */
  templatesPath?: string;
  /**
   * Volume mounts for persistence (e.g. workspace + Claude SDK session storage).
   * Each volume is created/fetched by name and mounted at the given path.
   */
  volumes?: SandockVolumeConfig[];
  /** Sandbox name/title for the Sandock API (e.g. for display in dashboard) */
  name?: string;

  /**
   * If true, skip installing SDK and runner (image already has them).
   * Only upload template files and use `sandagent run`. Use with pre-built images like vikadata/sandagent.
   */
  skipBootstrap?: boolean;

  /**
   * Environment variables to set in the sandbox.
   * These will be available to all commands executed in the sandbox.
   */
  env?: Record<string, string>;
}

/**
 * Sandock-based sandbox implementation.
 *
 * Uses the official Sandock SDK (https://sandock.ai) for cloud-based
 * Docker sandbox execution with persistent filesystems.
 */
export class SandockSandbox implements SandboxAdapter {
  private readonly client: SandockClient;
  private readonly image: string;
  private readonly workdir: string;
  private readonly memoryLimitMb?: number;
  private readonly cpuShares?: number;
  private readonly keep: boolean;
  private readonly timeout: number;
  private readonly templatesPath?: string;
  private readonly volumeConfigs: SandockVolumeConfig[];
  private readonly skipBootstrap: boolean;
  private readonly env: Record<string, string>;
  private readonly name?: string;

  /** Current handle for the sandbox instance */
  private currentHandle: SandboxHandle | null = null;
  private _sandboxId: string | null = null;
  private _volumes: Volume[] | null = null;

  constructor(options: SandockSandboxOptions = {}) {
    const apiKey = options.apiKey ?? process.env.SANDOCK_API_KEY;

    if (!apiKey) {
      console.warn(
        "SANDOCK_API_KEY not set. Sandock API calls will fail.\n" +
          "Get your API key at https://sandock.ai",
      );
    }

    this.client = createSandockClient({
      baseUrl: options.baseUrl ?? "https://sandock.ai",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });

    this.image = options.image ?? "sandockai/sandock-code:latest";
    this.workdir = options.workdir ?? "/workspace";
    this.memoryLimitMb = options.memoryLimitMb;
    this.cpuShares = options.cpuShares;
    this.keep = options.keep ?? true;
    this.timeout = options.timeout ?? 300000;
    this.templatesPath = options.templatesPath;
    this.volumeConfigs = options.volumes ?? [];
    this.skipBootstrap = options.skipBootstrap ?? false;
    this.env = options.env ?? {};
    this.name = options.name;
  }

  /**
   * Get the environment variables configured for this sandbox.
   */
  getEnv(): Record<string, string> {
    return this.env;
  }

  /**
   * Get the working directory configured for this sandbox.
   */
  getWorkdir(): string {
    return this.workdir;
  }

  /**
   * Get the runner command to execute in the sandbox.
   * When skipBootstrap is true, use image's sandagent; otherwise use npm-installed runner.
   */
  getRunnerCommand(): string[] {
    if (this.skipBootstrap) {
      return ["sandagent", "run"];
    }
    return [`${this.workdir}/node_modules/.bin/sandagent`, "run"];
  }

  /**
   * Get the current handle if already attached, or null if not attached yet.
   */
  getHandle(): SandboxHandle | null {
    return this.currentHandle;
  }

  async getSandboxId(): Promise<string | null> {
    if (!this.currentHandle) await this.attach();
    return this._sandboxId;
  }

  async getVolumes(): Promise<Volume[] | null> {
    if (!this.currentHandle) await this.attach();
    return this._volumes;
  }

  /**
   * Attach to or create a sandbox. Creates a new sandbox each time (no caching).
   */
  async attach(): Promise<SandboxHandle> {
    if (this.currentHandle) {
      return this.currentHandle;
    }
    const volumeMounts = await this.resolveVolumeMounts();
    const { sandboxId } = await this.createAndStartSandbox(volumeMounts);

    const handle = new SandockHandle(
      this.client,
      sandboxId,
      this.workdir,
      this.timeout,
      () => {},
      this.keep,
      this.env,
    );
    this._sandboxId = sandboxId;
    this._volumes = volumeMounts;
    await this.initializeSandbox(handle);
    this.currentHandle = handle;
    return handle;
  }

  /** Resolve volume configs to Volume[] (get/create by name, wait for ready). */
  private async resolveVolumeMounts(): Promise<Volume[]> {
    const volumeMounts: Volume[] = [];
    for (const v of this.volumeConfigs) {
      console.log(`[Sandock] Getting/creating volume: ${v.volumeName}`);
      const volume = await this.client.volume.getByName(v.volumeName, true);
      const mountPath = v.volumeMountPath;

      if (volume.data.status && volume.data.status !== "ready") {
        const ready = await this.waitVolumeReady(v.volumeName, 30000);
        if (!ready) {
          throw new Error(
            `Volume '${v.volumeName}' failed to become ready. Status: ${volume.data.status}`,
          );
        }
      }

      volumeMounts.push({
        volumeId: volume.data.id,
        mountPath,
        name: v.volumeName,
      });
      console.log(
        `[Sandock] Using volume ${volume.data.id} (${v.volumeName}) at ${mountPath}`,
      );
    }
    return volumeMounts;
  }

  private async waitVolumeReady(
    volumeName: string,
    maxWaitMs: number,
  ): Promise<boolean> {
    const startTime = Date.now();
    let current = await this.client.volume.getByName(volumeName, false);
    while (
      current.data.status !== "ready" &&
      Date.now() - startTime < maxWaitMs
    ) {
      console.log(
        `[Sandock] Volume ${volumeName} status: ${current.data.status}, waiting...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      current = await this.client.volume.getByName(volumeName, false);
    }
    return current.data.status === "ready";
  }

  /** Create sandbox and start it; returns sandbox id and volume mounts. */
  private async createAndStartSandbox(
    volumeMounts: Volume[],
  ): Promise<{ sandboxId: string; volumeMounts: Volume[] }> {
    const createOptions: {
      image: string;
      memory?: number;
      cpu?: number;
      volumes?: Array<{ volumeId: string; mountPath: string }>;
      title?: string;
    } = {
      image: this.image,
      memory: this.memoryLimitMb,
      cpu: this.cpuShares,
      title: this.name,
    };
    if (volumeMounts.length > 0) {
      createOptions.volumes = volumeMounts.map((v) => ({
        volumeId: v.volumeId,
        mountPath: v.mountPath,
      }));
    }

    const createResult = await this.client.sandbox.create(createOptions);
    const sandboxId = createResult.data.id;
    if (!sandboxId) {
      throw new Error("No sandbox ID returned from Sandock API");
    }
    console.log(
      `[Sandock] Created new sandbox: ${sandboxId} ${this.name ? `, title: ${this.name}` : ""}`,
    );
    await this.client.sandbox.start(sandboxId);
    return { sandboxId, volumeMounts };
  }

  private async initializeSandbox(handle: SandockHandle): Promise<void> {
    // Step 0: Create workspace directory
    console.log(`[Sandock] Creating workspace directory: ${this.workdir}`);
    const mkdirResult = await handle.runCommand(`mkdir -p ${this.workdir}`);
    if (mkdirResult.exitCode !== 0) {
      console.warn(`[Sandock] mkdir warning: ${mkdirResult.stderr}`);
    }

    if (this.skipBootstrap) {
      console.log(
        `[Sandock] skipBootstrap=true, skipping SDK and runner install`,
      );
    } else {
      // Install runner-cli from npm (brings in @anthropic-ai/claude-agent-sdk as dependency)
      console.log(
        `[Sandock] Installing @sandagent/runner-cli@beta to ${this.workdir}`,
      );
      const installResult = await handle.runCommand(
        `cd ${this.workdir} && npm install --no-audit --no-fund --prefer-offline @sandagent/runner-cli@beta 2>&1`,
      );
      if (installResult.exitCode !== 0) {
        console.error(
          `[Sandock] Failed to install runner-cli: ${installResult.stdout}`,
        );
      }
    }

    // Step 3: Upload template (user-selected template; always apply)
    if (this.templatesPath && fs.existsSync(this.templatesPath)) {
      const templateFiles = this.collectFiles(this.templatesPath, "");
      console.log(
        `[Sandock] Uploading ${templateFiles.length} template files to ${this.workdir}`,
      );
      await handle.upload(templateFiles, this.workdir);
    } else if (this.templatesPath) {
      console.warn(
        `[Sandock] Template path not found: ${this.templatesPath}, skipping`,
      );
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
        // Skip node_modules and .git only
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
 * Handle for an active Sandock sandbox
 */
class SandockHandle implements SandboxHandle {
  private readonly client: SandockClient;
  private readonly sandboxId: string;
  private readonly defaultWorkdir: string;
  private readonly timeout: number;
  private readonly onDestroy: () => void;
  private readonly keep: boolean;
  private readonly sandboxEnv: Record<string, string>;

  constructor(
    client: SandockClient,
    sandboxId: string,
    defaultWorkdir: string,
    timeout: number,
    onDestroy: () => void,
    keep: boolean,
    sandboxEnv: Record<string, string> = {},
  ) {
    this.client = client;
    this.sandboxId = sandboxId;
    this.defaultWorkdir = defaultWorkdir;
    this.timeout = timeout;
    this.onDestroy = onDestroy;
    this.keep = keep;
    this.sandboxEnv = sandboxEnv;
  }

  /**
   * Get the working directory for this sandbox handle
   */
  getWorkdir(): string {
    return this.defaultWorkdir;
  }

  /**
   * Run a command and wait for completion (used internally)
   */
  async runCommand(
    cmd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    let stdout = "";
    let stderr = "";

    const result = await this.client.sandbox.shell(
      this.sandboxId,
      { cmd, timeoutMs: this.timeout },
      {
        onStdout: (chunk: string) => {
          stdout += chunk;
        },
        onStderr: (chunk: string) => {
          stderr += chunk;
        },
      },
    );

    return {
      exitCode: result.data.exitCode ?? 0,
      stdout,
      stderr,
    };
  }

  /**
   * Execute a command in the sandbox and stream the output
   */
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array> {
    const self = this;
    const signal = opts?.signal;

    // Merge sandbox-level env with call-level env (call-level takes precedence)
    const envWithNodePath: Record<string, string> = {
      ...this.sandboxEnv,
      ...opts?.env,
      IS_SANDBOX: "1",
    };

    // Debug: log environment variables being passed to sandbox
    console.log("[Sandock] Executing command:", command.join(" "));
    console.log(
      "[Sandock] Environment variables:",
      Object.keys(envWithNodePath),
    );
    console.log(
      "[Sandock] ANTHROPIC_API_KEY present:",
      !!envWithNodePath.ANTHROPIC_API_KEY,
    );
    if (envWithNodePath.ANTHROPIC_API_KEY) {
      console.log(
        "[Sandock] ANTHROPIC_API_KEY prefix:",
        envWithNodePath.ANTHROPIC_API_KEY.substring(0, 10) + "...",
      );
    }

    return {
      async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        // Build command string - note: proper shell escaping would be better
        // but we maintain backward compatibility with the original implementation
        const baseCmd = command.length === 1 ? command[0] : command.join(" ");

        // Build full command with cwd and env support
        const parts: string[] = [];

        // Add working directory change (escape single quotes in path)
        const workdir = opts?.cwd ?? self.defaultWorkdir;
        if (workdir) {
          const escapedWorkdir = workdir.replace(/'/g, "'\\''");
          parts.push(`cd '${escapedWorkdir}'`);
        }

        // Add environment variables (validate keys and escape values)
        const validKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
        const envParts = Object.entries(envWithNodePath)
          .filter(([key]) => validKeyPattern.test(key))
          .map(([key, value]) => `export ${key}=${JSON.stringify(value)}`)
          .join(" && ");
        if (envParts) {
          parts.push(envParts);
        }

        // Wrap the command to capture its PID and handle signals
        // We write the PID to a file so we can kill it if needed
        const pidFile = `/tmp/sandagent-${Date.now()}-${Math.random().toString(36).substring(7)}.pid`;
        const wrappedCmd = `(${baseCmd}) & echo $! > ${pidFile}; wait $!; rm -f ${pidFile}`;
        parts.push(wrappedCmd);

        const cmd = parts.join(" && ");

        // Queue for streaming chunks
        const queue: Uint8Array[] = [];
        let done = false;
        let error: Error | null = null;
        let resolveWait: (() => void) | null = null;

        // Monitor abort signal and kill the process
        const abortHandler = async () => {
          console.log(
            "[Sandock] Abort signal received, terminating process...",
          );
          console.log("[Sandock] PID file:", pidFile);

          // Try to kill the process using the PID file
          try {
            // First check if PID file exists and read it
            const checkCmd = `if [ -f ${pidFile} ]; then cat ${pidFile}; else echo "PID file not found"; fi`;
            const checkResult = await self.client.sandbox.shell(
              self.sandboxId,
              { cmd: checkCmd, timeoutMs: 2000 },
              {},
            );
            console.log("[Sandock] PID check result:", checkResult.data.stdout);

            // Now try to kill the process
            const killCmd = `if [ -f ${pidFile} ]; then PID=$(cat ${pidFile}); echo "Killing PID: $PID"; kill -TERM $PID 2>&1 || echo "Kill failed"; rm -f ${pidFile}; else echo "No PID file to kill"; fi`;
            const killResult = await self.client.sandbox.shell(
              self.sandboxId,
              { cmd: killCmd, timeoutMs: 5000 },
              {},
            );
            console.log(
              "[Sandock] Kill command result:",
              killResult.data.stdout,
            );
            console.log(
              "[Sandock] Kill command stderr:",
              killResult.data.stderr,
            );
          } catch (err) {
            console.error("[Sandock] Failed to send termination signal:", err);
          }

          done = true;
          error = new Error("Operation aborted");
          error.name = "AbortError";
          resolveWait?.();
        };

        if (signal) {
          console.log("[Sandock] Adding abort signal listener");
          signal.addEventListener("abort", abortHandler);
        } else {
          console.log("[Sandock] No signal provided");
        }

        // Start shell command with streaming callbacks
        const shellPromise = self.client.sandbox.shell(
          self.sandboxId,
          { cmd, timeoutMs: self.timeout },
          {
            onStdout: (chunk: string) => {
              // Stop producing stdout chunks if signal is aborted
              if (signal?.aborted) return;
              queue.push(new TextEncoder().encode(chunk));
              resolveWait?.();
            },
            onStderr: (chunk: string) => {
              queue.push(new TextEncoder().encode(chunk));
              resolveWait?.();
            },
            onError: (err: unknown) => {
              console.log("SHELL ERROR:", err);
              error = err instanceof Error ? err : new Error(String(err));
              resolveWait?.();
            },
          },
        );

        // Handle completion
        shellPromise
          .then(
            (result: {
              success: boolean;
              data: {
                exitCode: number | null;
                stdout: string;
                stderr: string;
                timedOut: boolean;
                durationMs: number;
              };
            }) => {
              // Check for errors in the result
              if (result.data.timedOut) {
                error = new Error(
                  `Command timed out after ${result.data.durationMs}ms`,
                );
              } else if (
                result.data.exitCode !== 0 &&
                result.data.exitCode !== null
              ) {
                console.warn(
                  `Command exited with code ${result.data.exitCode}`,
                );
              }
              done = true;
              resolveWait?.();
            },
          )
          .catch((err: unknown) => {
            error = err instanceof Error ? err : new Error(String(err));
            // Log AbortError appropriately
            if (error.name === "AbortError") {
              console.log("[Sandock] Command execution aborted by user");
            } else {
              console.error("[Sandock] Shell promise rejected:", err);
            }
            done = true;
            resolveWait?.();
          })
          .finally(() => {
            if (signal) {
              signal.removeEventListener("abort", abortHandler);
            }
            // When keep is false, stop and delete sandbox after execution (default keep=true ~30 min retention)
            if (!self.keep) {
              self.client.sandbox
                .stop(self.sandboxId)
                .then(() => self.client.sandbox.delete(self.sandboxId))
                .catch((e) =>
                  console.error(
                    "[Sandock] Failed to stop/delete sandbox after execution:",
                    e,
                  ),
                );
            }
          });

        // Yield chunks as they arrive
        while (true) {
          // Check if signal is aborted
          if (signal?.aborted) {
            break;
          }

          // Yield all queued chunks
          while (queue.length > 0) {
            const chunk = queue.shift();
            if (chunk) {
              yield chunk;
            }
          }

          // Check for errors
          if (error) {
            throw error;
          }

          // Check if done
          if (done) {
            break;
          }

          // Wait for more data
          await new Promise<void>((resolve) => {
            resolveWait = resolve;
          });
        }
      },
    };
  }

  /**
   * Upload files to the sandbox
   */
  async upload(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string,
  ): Promise<void> {
    if (files.length === 0) return;
    // Ensure target directory exists (fs.write may not create parent dirs on the volume)
    const escapedDir = targetDir.replace(/'/g, "'\\''");
    const mkdirResult = await this.runCommand(`mkdir -p '${escapedDir}'`);
    if (mkdirResult.exitCode !== 0) {
      console.warn(
        `[Sandock] mkdir -p ${targetDir} failed: ${mkdirResult.stderr}`,
      );
    }
    for (const file of files) {
      const fullPath = `${targetDir}/${file.path}`;

      // Convert content to string
      const content =
        typeof file.content === "string"
          ? file.content
          : new TextDecoder().decode(file.content);

      // Use high-level fs.write API
      await this.client.fs.write(this.sandboxId, fullPath, content);
    }
  }

  async readFile(filePath: string): Promise<string> {
    const result = await this.client.fs.read(this.sandboxId, filePath);
    // Sandock fs.read returns { success: true, data: { path: string, content: string } }
    if (result.success && result.data) {
      return typeof result.data === "string"
        ? result.data
        : (result.data as { content?: string }).content || "";
    }
    throw new Error(`Failed to read file ${filePath}`);
  }

  /**
   * Destroy the sandbox and release resources
   */
  async destroy(): Promise<void> {
    // Stop the sandbox using high-level API
    await this.client.sandbox.stop(this.sandboxId);

    // Delete sandbox using high-level API
    await this.client.sandbox.delete(this.sandboxId);

    this.onDestroy();
  }
}
