import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@sandagent/core";
import { Sandbox } from "e2b";

/**
 * Options for creating an E2BSandbox instance
 */
export interface E2BSandboxOptions {
  /** E2B API key (defaults to E2B_API_KEY env var) */
  apiKey?: string;
  /** E2B template to use (default: "base") */
  template?: string;
  /** Timeout for sandbox operations in milliseconds (default: 0 = no timeout) */
  timeout?: number;
  /** Path to runner bundle.js (required for running sandagent) */
  runnerBundlePath?: string;
  /** Path to template directory to upload */
  templatesPath?: string;
}

/**
 * Type definitions for E2B SDK (e2b package)
 */
interface E2BSandboxInstance {
  sandboxId: string;
  commands: {
    run(
      cmd: string,
      opts?: {
        cwd?: string;
        envs?: Record<string, string>;
        onStdout?: (data: string) => void;
        onStderr?: (data: string) => void;
        timeoutMs?: number;
        requestTimeoutMs?: number;
      },
    ): Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>;
  };
  files: {
    write(path: string, content: string | ArrayBuffer): Promise<void>;
    makeDir(path: string): Promise<void>;
    read(path: string): Promise<string>;
    list(
      path: string,
    ): Promise<Array<{ name: string; type: "file" | "dir"; path: string }>>;
  };
  kill(): Promise<void>;
}

interface E2BSandboxStatic {
  create(opts?: {
    apiKey?: string;
    template?: string;
    timeoutMs?: number;
    metadata?: Record<string, string>;
  }): Promise<E2BSandboxInstance>;
  connect(
    sandboxId: string,
    opts?: { apiKey?: string },
  ): Promise<E2BSandboxInstance>;
}

/**
 * Cached sandbox instance with metadata
 */
interface CachedInstance {
  instance: E2BSandboxInstance;
  lastAccessTime: number;
}

/**
 * E2B-based sandbox implementation.
 */
export class E2BSandbox implements SandboxAdapter {
  private readonly apiKey?: string;
  private readonly template: string;
  private readonly timeout: number;
  private readonly runnerBundlePath?: string;
  private readonly templatesPath?: string;

  /** Global cache for sandbox instances (shared across all E2BSandbox instances) */
  private static readonly instances: Map<string, CachedInstance> = new Map();
  private static readonly initializedInstances: Set<string> = new Set();

  /** Maximum number of cached instances */
  private static readonly MAX_CACHE_SIZE = 50;
  /** Instance expiration time in milliseconds (default: 60 minutes) */
  private static readonly INSTANCE_TTL_MS = 60 * 60 * 1000;
  /** Cleanup interval timer (lazy initialized on first cache write) */
  private static cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: E2BSandboxOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.E2B_API_KEY;
    this.template = options.template ?? "base";
    this.timeout = options.timeout ?? E2BSandbox.INSTANCE_TTL_MS;
    this.runnerBundlePath = options.runnerBundlePath;
    this.templatesPath = options.templatesPath;
  }

  /**
   * Ensure cleanup timer is running (lazy initialization)
   */
  private static ensureCleanupTimer(): void {
    if (E2BSandbox.cleanupTimer) return;

    E2BSandbox.cleanupTimer = setInterval(
      () => {
        E2BSandbox.cleanupExpiredInstances();
      },
      5 * 60 * 1000,
    ); // Run every 5 minutes

    // Don't prevent process exit
    if (E2BSandbox.cleanupTimer.unref) {
      E2BSandbox.cleanupTimer.unref();
    }
  }

  /**
   * Remove expired instances from cache
   */
  private static cleanupExpiredInstances(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, cached] of E2BSandbox.instances) {
      if (now - cached.lastAccessTime > E2BSandbox.INSTANCE_TTL_MS) {
        expiredIds.push(id);
      }
    }

    for (const id of expiredIds) {
      const cached = E2BSandbox.instances.get(id);
      if (cached) {
        console.log(`[E2B] Removing expired sandbox instance: ${id}`);
        cached.instance.kill().catch((e) => {
          console.error(`[E2B] Error killing expired sandbox ${id}:`, e);
        });
        E2BSandbox.instances.delete(id);
        E2BSandbox.initializedInstances.delete(id);
      }
    }
  }

  /**
   * Evict oldest instance if cache is full
   */
  private static evictOldestIfNeeded(): void {
    // Lazy start cleanup timer on first cache write
    E2BSandbox.ensureCleanupTimer();

    if (E2BSandbox.instances.size < E2BSandbox.MAX_CACHE_SIZE) return;

    let oldestId: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [id, cached] of E2BSandbox.instances) {
      if (cached.lastAccessTime < oldestTime) {
        oldestTime = cached.lastAccessTime;
        oldestId = id;
      }
    }

    if (oldestId) {
      const cached = E2BSandbox.instances.get(oldestId);
      if (cached) {
        console.log(`[E2B] Evicting oldest sandbox instance: ${oldestId}`);
        cached.instance.kill().catch((e) => {
          console.error(`[E2B] Error killing evicted sandbox ${oldestId}:`, e);
        });
        E2BSandbox.instances.delete(oldestId);
        E2BSandbox.initializedInstances.delete(oldestId);
      }
    }
  }

  async attach(id: string): Promise<SandboxHandle> {
    if (!this.apiKey) {
      throw new Error(
        "E2B API key not found. Please set E2B_API_KEY environment variable or pass apiKey option.",
      );
    }

    const cached = E2BSandbox.instances.get(id);
    let instance = cached?.instance;

    let needsInit = false;

    if (instance) {
      // Update last access time
      E2BSandbox.instances.set(id, {
        instance,
        lastAccessTime: Date.now(),
      });
      console.log(`[E2B] Reusing cached sandbox instance: ${id}`);
    } else {
      // Evict oldest if cache is full before adding new instance
      E2BSandbox.evictOldestIfNeeded();

      instance = (await Sandbox.create(this.template, {
        apiKey: this.apiKey,
        timeoutMs: this.timeout,
        metadata: { sandagentId: id },
      })) as unknown as E2BSandboxInstance;
      E2BSandbox.instances.set(id, {
        instance,
        lastAccessTime: Date.now(),
      });
      needsInit = true;
    }

    const handle = new E2BHandle(instance, () => {
      E2BSandbox.instances.delete(id);
      E2BSandbox.initializedInstances.delete(id);
    });

    // Upload runner and templates on first attach
    if (needsInit && !E2BSandbox.initializedInstances.has(id)) {
      await this.initializeSandbox(handle, id);
      E2BSandbox.initializedInstances.add(id);
    }

    return handle;
  }

  private async initializeSandbox(
    handle: E2BHandle,
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
        `[E2B] Uploading runner bundle (${bundleFileName}) to sandbox ${id}`,
      );
    }

    // Upload template from specified path to /sandagent root
    if (this.templatesPath && fs.existsSync(this.templatesPath)) {
      const templateFiles = this.collectFiles(this.templatesPath, "");
      filesToUpload.push(...templateFiles);
      console.log(
        `[E2B] Uploading ${templateFiles.length} files from '${this.templatesPath}' to sandbox ${id}`,
      );
    } else if (this.templatesPath) {
      console.warn(
        `[E2B] Template path not found: ${this.templatesPath}, skipping`,
      );
    }

    if (filesToUpload.length > 0) {
      await handle.upload(filesToUpload, "/sandagent");

      // Install claude-agent-sdk in sandbox
      console.log(
        `[E2B] Installing @anthropic-ai/claude-agent-sdk in sandbox ${id}`,
      );
      const installResult = await handle.runCommand(
        "npm install --prefix /sandagent @anthropic-ai/claude-agent-sdk",
      );
      if (installResult.exitCode !== 0) {
        console.error(
          `[E2B] Failed to install claude-agent-sdk: ${installResult.stderr}`,
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
 * Handle for an active E2B sandbox
 */
class E2BHandle implements SandboxHandle {
  private readonly instance: E2BSandboxInstance;
  private readonly onDestroy: () => void;

  constructor(instance: E2BSandboxInstance, onDestroy: () => void) {
    this.instance = instance;
    this.onDestroy = onDestroy;
  }

  /**
   * Run a command and wait for completion (used internally)
   */
  async runCommand(
    cmd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return this.instance.commands.run(cmd);
  }

  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array> {
    const self = this;

    // Add NODE_PATH so Node can find packages installed in /sandagent
    const envWithNodePath: Record<string, string> = {
      ...opts?.env,
      NODE_PATH: "/sandagent/node_modules",
    };

    // Debug: log environment variables being passed to sandbox
    console.log("[E2B] Executing command:", command.join(" "));
    console.log("[E2B] Environment variables:", Object.keys(envWithNodePath));
    console.log(
      "[E2B] ANTHROPIC_API_KEY present:",
      !!envWithNodePath.ANTHROPIC_API_KEY,
    );
    if (envWithNodePath.ANTHROPIC_API_KEY) {
      console.log(
        "[E2B] ANTHROPIC_API_KEY prefix:",
        envWithNodePath.ANTHROPIC_API_KEY.substring(0, 10) + "...",
      );
    }

    return {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        const chunks: Uint8Array[] = [];
        let finished = false;
        let error: Error | null = null;
        let resolveNext: (() => void) | null = null;

        const commandPromise = self.instance.commands.run(command.join(" "), {
          cwd: opts?.cwd,
          envs: envWithNodePath,
          timeoutMs: 0, // 0 = no timeout for LLM operations
          requestTimeoutMs: 0, // 0 = no request timeout
          onStdout: (data: string) => {
            const chunk = new TextEncoder().encode(data);
            chunks.push(chunk);
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          },
          onStderr: (data: string) => {
            console.error(`[E2B stderr] ${data}`);
          },
        });

        commandPromise
          .then((result) => {
            console.log(
              "[E2B] Command completed with exit code:",
              result.exitCode,
            );
            if (result.stdout)
              console.log("[E2B] stdout:", result.stdout.substring(0, 500));
            if (result.stderr)
              console.log("[E2B] stderr:", result.stderr.substring(0, 500));
            finished = true;
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          })
          .catch((err) => {
            error = err instanceof Error ? err : new Error(String(err));
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          });

        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            if (chunks.length > 0) {
              return { value: chunks.shift()!, done: false };
            }
            if (finished && chunks.length === 0) {
              return { value: undefined, done: true };
            }
            if (error) {
              throw error;
            }
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
            if (chunks.length > 0) {
              return { value: chunks.shift()!, done: false };
            }
            if (error) {
              throw error;
            }
            return { value: undefined, done: true };
          },
        };
      },
    };
  }

  async upload(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string,
  ): Promise<void> {
    for (const file of files) {
      const fullPath = `${targetDir}/${file.path}`;
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));
      if (dirPath) {
        try {
          await this.instance.files.makeDir(dirPath);
        } catch {
          // Directory might already exist
        }
      }
      const content =
        file.content instanceof Uint8Array
          ? (file.content.buffer.slice(
              file.content.byteOffset,
              file.content.byteOffset + file.content.byteLength,
            ) as ArrayBuffer)
          : file.content;
      await this.instance.files.write(fullPath, content);
    }
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    console.log(`[E2B] Downloading ${remotePath} to ${localPath}`);

    // Ensure local directory exists
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    // List files in remote directory
    try {
      const entries = await this.instance.files.list(remotePath);

      for (const entry of entries) {
        const localFilePath = path.join(localPath, entry.name);
        const remoteFilePath = entry.path;

        if (entry.type === "dir") {
          // Recursively download subdirectories
          await this.download(remoteFilePath, localFilePath);
        } else {
          // Download file
          try {
            const content = await this.instance.files.read(remoteFilePath);
            fs.writeFileSync(localFilePath, content);
            console.log(
              `[E2B] Downloaded: ${remoteFilePath} -> ${localFilePath}`,
            );
          } catch (err) {
            console.error(`[E2B] Failed to download ${remoteFilePath}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`[E2B] Failed to list ${remotePath}:`, err);
    }
  }

  async destroy(): Promise<void> {
    await this.instance.kill();
    this.onDestroy();
  }
}
