import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@sandagent/manager";
import { Sandbox, type SandboxInfo } from "e2b";

/**
 * Options for creating an E2BSandbox instance
 */
export interface E2BSandboxOptions {
  /** E2B API key (defaults to E2B_API_KEY env var) */
  apiKey?: string;
  /** E2B template to use (default: "base") */
  template?: string;
  /**
   * Timeout for sandbox in seconds.
   * This is the maximum time the sandbox can run continuously.
   * - Hobby tier: max 1 hour (3600s)
   * - Pro tier: max 24 hours (86400s)
   * Default: 3600 (1 hour)
   *
   * Note: Sandbox can be paused for up to 30 days with E2B's persistence feature.
   */
  timeout?: number;
  /** Path to runner bundle.js (required for running sandagent) */
  runnerBundlePath?: string;
  /** Path to template directory to upload */
  templatesPath?: string;
  /**
   * Sandbox name for reuse (similar to Daytona).
   * If provided, will try to find an existing sandbox by name (via metadata) first.
   * If not found, creates a new sandbox with this name stored in metadata.
   * If not provided, a new sandbox is always created.
   *
   * The name should be determined by the business layer and can include
   * template/user/project information as needed for differentiation.
   */
  name?: string;

  /**
   * Environment variables to set in the sandbox.
   * These will be available to all commands executed in the sandbox.
   *
   * @example
   * ```typescript
   * env: {
   *   ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
   *   GITHUB_TOKEN: process.env.GITHUB_TOKEN,
   * }
   * ```
   */
  env?: Record<string, string>;

  /**
   * Agent template to use (e.g., "default", "coder", "analyst", "researcher").
   * This is different from the E2B sandbox template.
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
 * E2B-based sandbox implementation.
 *
 * This adapter supports sandbox reuse based on sandbox name (similar to Daytona).
 * When a name is provided, it will attempt to find an existing sandbox
 * by that name (stored in metadata) first. If not found, creates a new sandbox
 * with that name in metadata.
 *
 * If no name is provided, a new sandbox is always created.
 *
 * Note on E2B limitations (as of beta):
 * - Sandbox can be paused for up to 30 days
 * - Continuous runtime depends on tier:
 *   - Hobby: max 1 hour
 *   - Pro: max 24 hours
 * - See: https://e2b.dev/docs/sandbox/persistence#limitations-while-in-beta
 */
export class E2BSandbox implements SandboxAdapter {
  private readonly apiKey?: string;
  private readonly template: string;
  private readonly timeout: number;
  private readonly runnerBundlePath?: string;
  private readonly templatesPath?: string;
  private readonly name?: string;
  private readonly env: Record<string, string>;
  private readonly agentTemplate: string;
  private readonly workdir: string;

  /** Default timeout in seconds (1 hour for hobby tier) */
  private static readonly DEFAULT_TIMEOUT_SEC = 3600;

  constructor(options: E2BSandboxOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.E2B_API_KEY;
    this.template = options.template ?? "base";
    // Default to 1 hour (hobby tier limit), convert to milliseconds for E2B SDK
    this.timeout = (options.timeout ?? E2BSandbox.DEFAULT_TIMEOUT_SEC) * 1000;
    this.runnerBundlePath = options.runnerBundlePath;
    this.templatesPath = options.templatesPath;
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

  /**
   * Find an existing sandbox by name and connect to it.
   * Sandbox.connect() will automatically resume if paused.
   * See: https://e2b.dev/docs/sandbox/persistence
   *
   * @returns Connected sandbox instance if found, null otherwise
   */
  private async findSandboxByName(name: string): Promise<Sandbox | null> {
    try {
      // Use Sandbox.list() with metadata query
      const paginator = Sandbox.list({
        apiKey: this.apiKey,
        query: {
          metadata: {
            sandagentName: name,
          },
        },
      });

      // Get the first page of results
      const sandboxes: SandboxInfo[] = await paginator.nextItems();

      if (sandboxes.length === 0) {
        console.log(`[E2B] No existing sandbox found for name: ${name}`);
        return null;
      }

      const sandboxInfo = sandboxes[0];
      console.log(
        `[E2B] Found existing sandbox by name: ${name}, id: ${sandboxInfo.sandboxId}, state: ${sandboxInfo.state}`,
      );

      // Connect to sandbox (will auto-resume if paused)
      const sandbox = await Sandbox.connect(sandboxInfo.sandboxId, {
        apiKey: this.apiKey,
        timeoutMs: this.timeout,
      });

      console.log(
        `[E2B] Successfully connected to sandbox: ${sandboxInfo.sandboxId}`,
      );
      return sandbox;
    } catch (error) {
      console.warn(`[E2B] Failed to find/connect sandbox by name:`, error);
      return null;
    }
  }

  async attach(id: string): Promise<SandboxHandle> {
    if (!this.apiKey) {
      throw new Error(
        "E2B API key not found. Please set E2B_API_KEY environment variable or pass apiKey option.",
      );
    }

    let instance: Sandbox;
    let needsInit = false;

    // Use the provided id parameter, fallback to this.name
    const sandboxName = id || this.name;

    // If name is provided, try to find and connect to existing sandbox
    if (sandboxName) {
      console.log(
        `[E2B] Looking for existing sandbox with name: ${sandboxName}`,
      );

      const existingSandbox = await this.findSandboxByName(sandboxName);

      if (existingSandbox) {
        instance = existingSandbox;
      } else {
        // No existing sandbox found or connection failed, create new one
        instance = await this.createNewSandbox(sandboxName);
        needsInit = true;
      }
    } else {
      // No name provided - always create new sandbox
      console.log(`[E2B] No name provided, creating new sandbox`);
      instance = await this.createNewSandbox();
      needsInit = true;
    }

    const handle = new E2BHandle(instance, this.env);

    // Initialize sandbox if it's new (upload files, install dependencies)
    if (needsInit) {
      await this.initializeSandbox(handle);
    }

    return handle;
  }

  /**
   * Create a new sandbox with metadata for later querying
   */
  private async createNewSandbox(name?: string): Promise<Sandbox> {
    const metadata: Record<string, string> = {};

    // Use provided name or fallback to this.name
    const sandboxName = name || this.name;

    // Add name to metadata if provided (for sandbox reuse)
    if (sandboxName) {
      metadata.sandagentName = sandboxName;
    }

    console.log(
      `[E2B] Creating new sandbox with template "${this.template}"${sandboxName ? `, name "${sandboxName}"` : ""}, timeout=${this.timeout / 1000}s`,
    );

    const instance = await Sandbox.create(this.template, {
      apiKey: this.apiKey,
      timeoutMs: this.timeout,
      metadata,
    });

    console.log(`[E2B] Sandbox created: ${instance.sandboxId}`);
    return instance;
  }

  private async initializeSandbox(handle: E2BHandle): Promise<void> {
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
        `[E2B] Uploading runner bundle (${bundleFileName}) to /sandagent`,
      );
      await handle.upload(runnerFiles, "/sandagent");

      // Install claude-agent-sdk in sandbox
      console.log(`[E2B] Installing @anthropic-ai/claude-agent-sdk`);
      const installResult = await handle.runCommand(
        "npm install --prefix /sandagent @anthropic-ai/claude-agent-sdk",
      );
      if (installResult.exitCode !== 0) {
        console.error(
          `[E2B] Failed to install claude-agent-sdk: ${installResult.stderr}`,
        );
      }
    }

    // Upload template to workdir (where runner will execute)
    if (this.templatesPath && fs.existsSync(this.templatesPath)) {
      const templateFiles = this.collectFiles(this.templatesPath, "");
      console.log(
        `[E2B] Uploading ${templateFiles.length} template files to ${this.workdir}`,
      );
      await handle.upload(templateFiles, this.workdir);
    } else if (this.templatesPath) {
      console.warn(
        `[E2B] Template path not found: ${this.templatesPath}, skipping`,
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
 * Handle for an active E2B sandbox
 */
class E2BHandle implements SandboxHandle {
  private readonly instance: Sandbox;
  private readonly sandboxEnv: Record<string, string>;

  constructor(instance: Sandbox, sandboxEnv: Record<string, string> = {}) {
    this.instance = instance;
    this.sandboxEnv = sandboxEnv;
  }

  /**
   * Get the sandbox ID (useful for external tracking)
   */
  getSandboxId(): string {
    return this.instance.sandboxId;
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
    return this.instance.commands.run(cmd);
  }

  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array> {
    const self = this;
    const signal = opts?.signal;

    // Merge sandbox-level env with call-level env (call-level takes precedence)
    // Add NODE_PATH so Node can find packages installed in /sandagent
    const envWithNodePath: Record<string, string> = {
      ...this.sandboxEnv,
      ...opts?.env,
      NODE_PATH: "/sandagent/node_modules",
    };

    // Build shell-safe command string with proper escaping
    const baseCommand = this.buildShellCommand(command);

    // Wrap command to capture PID for potential termination
    const pidFile = `/tmp/sandagent-${Date.now()}-${Math.random().toString(36).substring(7)}.pid`;
    const shellCommand = `(${baseCommand}) & echo $! > ${pidFile}; wait $!; EXIT_CODE=$?; rm -f ${pidFile}; exit $EXIT_CODE`;

    // Debug: log environment variables being passed to sandbox
    console.log("[E2B] Executing command:", baseCommand);
    console.log("[E2B] PID file:", pidFile);
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

        // Monitor abort signal and kill the process
        const abortHandler = async () => {
          console.log("[E2B] Abort signal received, terminating process...");
          console.log("[E2B] PID file:", pidFile);

          finished = true;
          error = new Error("Operation aborted");
          error.name = "AbortError";

          // Try to kill the process using the PID file
          try {
            // Check if PID file exists and kill the process
            const killCmd = `if [ -f ${pidFile} ]; then PID=$(cat ${pidFile}); echo "Killing PID: $PID"; kill -TERM $PID 2>&1 || echo "Kill failed"; rm -f ${pidFile}; else echo "No PID file found"; fi`;

            // Execute kill command asynchronously (don't wait for result)
            self.instance.commands
              .run(killCmd, {
                timeoutMs: 5000,
              })
              .then((result) => {
                console.log("[E2B] Kill command output:", result.stdout);
                if (result.stderr) {
                  console.log("[E2B] Kill command stderr:", result.stderr);
                }
              })
              .catch((err) => {
                console.error("[E2B] Failed to execute kill command:", err);
              });
          } catch (err) {
            console.error("[E2B] Failed to send termination signal:", err);
          }

          if (resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        };

        if (signal) {
          console.log("[E2B] Adding abort signal listener");
          signal.addEventListener("abort", abortHandler);
        } else {
          console.log("[E2B] No signal provided");
        }

        const commandPromise = self.instance.commands.run(shellCommand, {
          cwd: opts?.cwd,
          envs: envWithNodePath,
          timeoutMs: 0, // 0 = no timeout for LLM operations
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
            finished = true;
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          })
          .catch((err) => {
            error = err instanceof Error ? err : new Error(String(err));
            // Log AbortError appropriately
            if (error.name === "AbortError") {
              console.log("[E2B] Command execution aborted by user");
            } else {
              console.error("[E2B] Command execution error:", error.message);
            }
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          })
          .finally(() => {
            // Remove event listener when iterator completes
            if (signal) {
              signal.removeEventListener("abort", abortHandler);
            }
          });

        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            // Check if signal is aborted and no more chunks
            if (signal?.aborted && chunks.length === 0) {
              console.log("[E2B] Signal aborted, stopping iteration");
              return { value: undefined, done: true };
            }

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

  async destroy(): Promise<void> {
    // Note: We don't kill the sandbox here to allow reuse
    // The sandbox will auto-terminate based on the configured timeout
    // or can be paused for up to 30 days with E2B's persistence feature
    console.log(
      `[E2B] Sandbox ${this.instance.sandboxId} handle destroyed (sandbox continues running for reuse)`,
    );
  }
}
