import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@sandagent/core";
import { type SandockClient, createSandockClient } from "sandock";

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
  /** Keep sandbox running after execution */
  keep?: boolean;
  /** Timeout for sandbox operations in milliseconds (default: 300000 = 5 min) */
  timeout?: number;
  /** Path to runner bundle.js (required for running sandagent) */
  runnerBundlePath?: string;
  /** Path to template directory to upload */
  templatesPath?: string;
}

/**
 * Cached sandbox instance with metadata
 */
interface CachedInstance {
  sandboxId: string;
  lastAccessTime: number;
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
  private readonly runnerBundlePath?: string;
  private readonly templatesPath?: string;

  /** Global cache for sandbox instances (shared across all SandockSandbox instances) */
  private static readonly instances: Map<string, CachedInstance> = new Map();
  private static readonly initializedInstances: Set<string> = new Set();

  /** Maximum number of cached instances */
  private static readonly MAX_CACHE_SIZE = 50;
  /** Instance expiration time in milliseconds (default: 30 minutes) */
  private static readonly INSTANCE_TTL_MS = 30 * 60 * 1000;
  /** Cleanup interval timer (lazy initialized on first cache write) */
  private static cleanupTimer: ReturnType<typeof setInterval> | null = null;

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
    this.runnerBundlePath = options.runnerBundlePath;
    this.templatesPath = options.templatesPath;
  }

  /**
   * Ensure cleanup timer is running (lazy initialization)
   */
  private static ensureCleanupTimer(client: SandockClient): void {
    if (SandockSandbox.cleanupTimer) return;

    SandockSandbox.cleanupTimer = setInterval(
      () => {
        SandockSandbox.cleanupExpiredInstances(client);
      },
      5 * 60 * 1000,
    ); // Run every 5 minutes

    // Don't prevent process exit
    if (SandockSandbox.cleanupTimer.unref) {
      SandockSandbox.cleanupTimer.unref();
    }
  }

  /**
   * Remove expired instances from cache
   */
  private static cleanupExpiredInstances(client: SandockClient): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, cached] of SandockSandbox.instances) {
      if (now - cached.lastAccessTime > SandockSandbox.INSTANCE_TTL_MS) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      const cached = SandockSandbox.instances.get(id);
      if (cached) {
        console.log(`[Sandock] Removing expired sandbox instance: ${id}`);
        client.sandbox.stop(cached.sandboxId).catch((e) => {
          console.error(`[Sandock] Error stopping expired sandbox ${id}:`, e);
        });
        SandockSandbox.instances.delete(id);
        SandockSandbox.initializedInstances.delete(id);
      }
    }
  }

  /**
   * Evict oldest instance if cache is full
   */
  private evictOldestIfNeeded(): void {
    // Lazy start cleanup timer on first cache write
    SandockSandbox.ensureCleanupTimer(this.client);

    if (SandockSandbox.instances.size < SandockSandbox.MAX_CACHE_SIZE) return;

    let oldestId: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [id, cached] of SandockSandbox.instances) {
      if (cached.lastAccessTime < oldestTime) {
        oldestTime = cached.lastAccessTime;
        oldestId = id;
      }
    }

    if (oldestId) {
      const cached = SandockSandbox.instances.get(oldestId);
      if (cached) {
        console.log(`[Sandock] Evicting oldest sandbox instance: ${oldestId}`);
        this.client.sandbox.stop(cached.sandboxId).catch((e) => {
          console.error(
            `[Sandock] Error stopping evicted sandbox ${oldestId}:`,
            e,
          );
        });
        SandockSandbox.instances.delete(oldestId);
        SandockSandbox.initializedInstances.delete(oldestId);
      }
    }
  }

  /**
   * Attach to or create a sandbox with the given ID
   */
  async attach(id: string): Promise<SandboxHandle> {
    const cached = SandockSandbox.instances.get(id);
    let sandboxId = cached?.sandboxId;
    let needsInit = false;

    if (sandboxId) {
      // Update last access time
      SandockSandbox.instances.set(id, {
        sandboxId,
        lastAccessTime: Date.now(),
      });
      console.log(`[Sandock] Reusing cached sandbox instance: ${id}`);
    } else {
      // Evict oldest if cache is full before adding new instance
      this.evictOldestIfNeeded();

      // Create sandbox using high-level API
      const createResult = await this.client.sandbox.create({
        image: this.image,
        memory: this.memoryLimitMb,
        cpu: this.cpuShares,
      });

      console.log(
        `[Sandock] Sandbox creation result: ${JSON.stringify(createResult)}`,
      );
      sandboxId = createResult.data.id;
      if (!sandboxId) {
        throw new Error("No sandbox ID returned from Sandock API");
      }

      console.log(`[Sandock] Created new sandbox: ${sandboxId}`);

      // Start the sandbox using high-level API
      await this.client.sandbox.start(sandboxId);

      SandockSandbox.instances.set(id, {
        sandboxId,
        lastAccessTime: Date.now(),
      });

      // Remove old initialized flag for this user ID when creating new sandbox
      SandockSandbox.initializedInstances.delete(id);
      needsInit = true;
    }

    const handle = new SandockHandle(
      this.client,
      sandboxId,
      this.workdir,
      this.timeout,
      () => {
        SandockSandbox.instances.delete(id);
        SandockSandbox.initializedInstances.delete(id);
      },
    );

    // Upload runner and templates on first attach
    if (needsInit && !SandockSandbox.initializedInstances.has(id)) {
      await this.initializeSandbox(handle, id);
      SandockSandbox.initializedInstances.add(id);
    }

    return handle;
  }

  private async initializeSandbox(
    handle: SandockHandle,
    id: string,
  ): Promise<void> {
    const filesToUpload: Array<{ path: string; content: Uint8Array | string }> =
      [];

    // Upload runner bundle
    if (this.runnerBundlePath && fs.existsSync(this.runnerBundlePath)) {
      const bundleContent = fs.readFileSync(this.runnerBundlePath);
      const bundleFileName = path.basename(this.runnerBundlePath);
      filesToUpload.push({
        path: `runner/${bundleFileName}`,
        content: bundleContent,
      });
      console.log(
        `[Sandock] Uploading runner bundle (${bundleFileName}) to sandbox ${id}`,
      );
    }

    // Upload template from specified path to /sandagent root
    if (this.templatesPath && fs.existsSync(this.templatesPath)) {
      const templateFiles = this.collectFiles(this.templatesPath, "");
      filesToUpload.push(...templateFiles);
      console.log(
        `[Sandock] Uploading ${templateFiles.length} files from '${this.templatesPath}' to sandbox ${id}`,
      );
    } else if (this.templatesPath) {
      console.warn(
        `[Sandock] Template path not found: ${this.templatesPath}, skipping`,
      );
    }

    if (filesToUpload.length > 0) {
      await handle.upload(filesToUpload, "/sandagent");

      // Install claude-agent-sdk in sandbox
      console.log(
        `[Sandock] Installing @anthropic-ai/claude-agent-sdk in sandbox ${id}`,
      );
      const installResult = await handle.runCommand(
        "npm install --prefix /sandagent @anthropic-ai/claude-agent-sdk",
      );
      if (installResult.exitCode !== 0) {
        console.error(
          `[Sandock] Failed to install claude-agent-sdk: ${installResult.stderr}`,
        );
      }
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

  constructor(
    client: SandockClient,
    sandboxId: string,
    defaultWorkdir: string,
    timeout: number,
    onDestroy: () => void,
  ) {
    this.client = client;
    this.sandboxId = sandboxId;
    this.defaultWorkdir = defaultWorkdir;
    this.timeout = timeout;
    this.onDestroy = onDestroy;
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

    // Add NODE_PATH so Node can find packages installed in /sandagent
    const envWithNodePath: Record<string, string> = {
      ...opts?.env,
      IS_SANDBOX: "1",
      NODE_PATH: "/sandagent/node_modules",
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
              console.log("STDERR CHUNK:", chunk);
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
          .then((result) => {
            // Check for errors in the result
            console.log(
              "[Sandock] Command completed with exit code:",
              result.data.exitCode,
            );
            console.log(
              "[Sandock] Command stdout:",
              result.data.stdout?.substring(0, 500) || "(empty)",
            );
            console.log(
              "[Sandock] Command stderr:",
              result.data.stderr?.substring(0, 500) || "(empty)",
            );
            if (result.data.timedOut) {
              error = new Error(
                `Command timed out after ${result.data.durationMs}ms`,
              );
            } else if (
              result.data.exitCode !== 0 &&
              result.data.exitCode !== null
            ) {
              console.warn(`Command exited with code ${result.data.exitCode}`);
            }
            done = true;
            resolveWait?.();
          })
          .catch((err) => {
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
            // Remove event listener when iterator completes
            if (signal) {
              signal.removeEventListener("abort", abortHandler);
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

  /**
   * Destroy the sandbox and release resources
   */
  async destroy(): Promise<void> {
    // Stop the sandbox using high-level API
    await this.client.sandbox.stop(this.sandboxId);

    // Delete sandbox using high-level API
    await this.client.sandbox.delete(this.sandboxId);

    // Clean up from cache
    this.onDestroy();
  }
}
