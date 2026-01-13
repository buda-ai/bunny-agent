import * as fs from "node:fs";
import * as path from "node:path";
import { Daytona, VolumeMount, type Sandbox } from "@daytonaio/sdk";
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
 * In-memory store for session -> sandbox/volume mapping
 * This enables sandbox persistence across requests
 */
interface SessionState {
  sandboxId: string;
  volumeId: string;
  volumeName: string;
}

// Global in-memory store for session states
const sessionStore = new Map<string, SessionState>();

/**
 * Get stored session state
 */
export function getSessionState(sessionId: string): SessionState | undefined {
  return sessionStore.get(sessionId);
}

/**
 * Set session state
 */
export function setSessionState(sessionId: string, state: SessionState): void {
  sessionStore.set(sessionId, state);
}

/**
 * Clear session state
 */
export function clearSessionState(sessionId: string): void {
  sessionStore.delete(sessionId);
}

/**
 * List all stored sessions
 */
export function listSessions(): Map<string, SessionState> {
  return new Map(sessionStore);
}

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
  /** Optional volumes to attach to the sandbox */
  volumes?: VolumeConfig[];
  /** Enable volume-based persistence for sandbox state */
  enablePersistence?: boolean;
  /** Mount path for the persistence volume (default: /sandagent-data) */
  persistenceMountPath?: string;
}

/**
 * Daytona-based sandbox implementation.
 */
export class DaytonaSandbox implements SandboxAdapter {
  private readonly apiKey?: string;
  private readonly apiUrl?: string;
  private readonly timeout: number;
  private readonly runnerBundlePath?: string;
  private readonly templatesPath?: string;
  private readonly volumes?: VolumeConfig[];
  private readonly enablePersistence: boolean;
  private readonly persistenceMountPath: string;

  constructor(options: DaytonaSandboxOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DAYTONA_API_KEY;
    this.apiUrl = options.apiUrl ?? process.env.DAYTONA_API_URL;
    this.timeout = options.timeout ?? 0;
    this.runnerBundlePath = options.runnerBundlePath;
    this.templatesPath = options.templatesPath;
    this.volumes = options.volumes;
    this.enablePersistence = options.enablePersistence ?? false;
    this.persistenceMountPath = options.persistenceMountPath ?? "/sandagent-data";
  }

  async attach(id: string): Promise<SandboxHandle> {
    if (!this.apiKey) {
      throw new Error(
        "Daytona API key not found. Please set DAYTONA_API_KEY environment variable or pass apiKey option.",
      );
    }

    const daytona = new Daytona({
      apiKey: this.apiKey,
      apiUrl: this.apiUrl,
    });

    // Check if we have a stored session state for this agent
    const storedState = getSessionState(id);
    
    if (this.enablePersistence && storedState) {
      // Try to restore existing sandbox
      console.log(`[Daytona] Found stored session for agent: ${id}`);
      console.log(`[Daytona] Attempting to restore sandbox: ${storedState.sandboxId}`);
      
      try {
        const existingSandbox = await daytona.get(storedState.sandboxId);
        
        // Check sandbox state and start if needed
        if (existingSandbox.state === "stopped" || existingSandbox.state === "archived") {
          console.log(`[Daytona] Sandbox ${existingSandbox.id} is ${existingSandbox.state}, starting...`);
          await existingSandbox.start(this.timeout || 60);
        } else if (existingSandbox.state === "started") {
          console.log(`[Daytona] Sandbox ${existingSandbox.id} is already running`);
        } else {
          console.log(`[Daytona] Sandbox ${existingSandbox.id} is in state: ${existingSandbox.state}`);
          await existingSandbox.waitUntilStarted(this.timeout || 60);
        }
        
        console.log(`[Daytona] Restored sandbox ${existingSandbox.id} with volume ${storedState.volumeId}`);
        return new DaytonaHandle(existingSandbox);
      } catch (err) {
        console.warn(`[Daytona] Failed to restore sandbox: ${err instanceof Error ? err.message : String(err)}`);
        console.log(`[Daytona] Creating new sandbox with existing volume...`);
        // Clear the invalid session state, but keep the volume for new sandbox
        clearSessionState(id);
        
        // Create new sandbox with the existing volume
        return this.createNewSandbox(daytona, id, storedState.volumeId, storedState.volumeName);
      }
    }

    // Create new sandbox (with or without persistence)
    return this.createNewSandbox(daytona, id);
  }

  /**
   * Create a new sandbox, optionally with persistence volume
   */
  private async createNewSandbox(
    daytona: Daytona, 
    id: string, 
    existingVolumeId?: string,
    existingVolumeName?: string
  ): Promise<SandboxHandle> {
    console.log(`[Daytona] Creating sandbox for agent: ${id}`);

    let volumesToMount = this.volumes ? [...this.volumes] : [];
    let volumeId = existingVolumeId;
    let volumeName = existingVolumeName;

    // Set up persistence volume if enabled
    if (this.enablePersistence) {
      if (!volumeId) {
        // Create a new volume for this session
        // Use a sanitized version of the session ID as the volume name
        volumeName = `sandagent-${id.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()}`;
        console.log(`[Daytona] Creating/getting persistence volume: ${volumeName}`);
        
        try {
          // get() with create=true will create the volume if it doesn't exist
          const volume = await daytona.volume.get(volumeName, true);
          volumeId = volume.id;
          console.log(`[Daytona] Got volume: ${volumeId} (${volumeName})`);
        } catch (err) {
          console.error(`[Daytona] Failed to create volume: ${err instanceof Error ? err.message : String(err)}`);
          // Continue without persistence if volume creation fails
        }
      }

      if (volumeId && volumeName) {
        // Add the persistence volume to the mount list
        volumesToMount.push({
          volumeId,
          mountPath: this.persistenceMountPath,
        });
        console.log(`[Daytona] Mounting volume ${volumeId} at ${this.persistenceMountPath}`);
      }
    }

    const sandbox = await daytona.create(
      {
        language: "typescript",
        volumes: volumesToMount.length > 0 ? volumesToMount : undefined,
      },
      { timeout: this.timeout },
    );
    await sandbox.start();

    console.log(`[Daytona] Sandbox ${sandbox.id} started`);

    // Store the session state if persistence is enabled
    if (this.enablePersistence && volumeId && volumeName) {
      setSessionState(id, {
        sandboxId: sandbox.id,
        volumeId,
        volumeName,
      });
      console.log(`[Daytona] Stored session state for agent: ${id}`);
    }

    const handle = new DaytonaHandle(sandbox);
    await this.initializeSandbox(handle, id);

    return handle;
  }

  private async initializeSandbox(
    handle: DaytonaHandle,
    id: string,
  ): Promise<void> {
    const filesToUpload: Array<{ path: string; content: Uint8Array | string }> =
      [];

    if (this.runnerBundlePath && fs.existsSync(this.runnerBundlePath)) {
      const bundleContent = fs.readFileSync(this.runnerBundlePath);
      const bundleFileName = path.basename(this.runnerBundlePath);
      filesToUpload.push({
        path: `runner/${bundleFileName}`,
        content: bundleContent,
      });
      console.log(
        `[Daytona] Uploading runner bundle (${bundleFileName}) to sandbox ${id}`,
      );
    }

    if (this.templatesPath && fs.existsSync(this.templatesPath)) {
      const templateFiles = this.collectFiles(this.templatesPath, "");
      filesToUpload.push(...templateFiles);
      console.log(
        `[Daytona] Uploading ${templateFiles.length} files from '${this.templatesPath}' to sandbox ${id}`,
      );
    }

    if (filesToUpload.length > 0) {
      await handle.upload(filesToUpload, "/sandagent");

      console.log(
        `[Daytona] Installing @anthropic-ai/claude-agent-sdk in sandbox ${id}`,
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

  constructor(sandbox: Sandbox) {
    this.sandbox = sandbox;
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

    // Add NODE_PATH so Node can find packages installed in /sandagent
    const envWithNodePath: Record<string, string> = {
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
    console.log("[Daytona] Executing command:", baseCommand);
    console.log("[Daytona] Environment variables:", Object.keys(envWithNodePath));
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
          console.log("[Daytona] Abort signal received, terminating session...");
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
                chunks.push(new TextEncoder().encode(chunk));
                if (resolveNext) {
                  resolveNext();
                  resolveNext = null;
                }
              },
              (chunk: string) => {
                console.error(`[Daytona stderr] ${chunk}`);
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
              console.error("[Daytona] Command execution error:", error.message);
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
    for (const file of files) {
      const fullPath = `${targetDir}/${file.path}`;
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));

      if (dirPath) {
        try {
          await this.sandbox.fs.createFolder(dirPath, "755");
        } catch {
          // Directory might already exist
        }
      }

      const content =
        file.content instanceof Uint8Array
          ? new TextDecoder().decode(file.content)
          : file.content;

      await this.sandbox.fs.uploadFile(content, fullPath);
    }
  }

  async destroy(): Promise<void> {
    // Daytona sandbox lifecycle is managed by the platform, no manual cleanup needed
  }
}
