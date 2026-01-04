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
}

// Type for API response with data and error
interface ApiResponse<T> {
  data?: T;
  error?: unknown;
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
  }

  /**
   * Attach to or create a sandbox with the given ID
   */
  async attach(id: string): Promise<SandboxHandle> {
    // Create sandbox via Sandock API
    const createResult = (await this.client.POST("/api/v1/sandbox", {
      body: {
        actorUserId: id,
        image: this.image,
        workdir: this.workdir,
        memoryLimitMb: this.memoryLimitMb,
        cpuShares: this.cpuShares,
        keep: this.keep,
      },
    })) as ApiResponse<{ data: { id: string } }>;

    if (createResult.error) {
      throw new Error(
        `Failed to create sandbox: ${JSON.stringify(createResult.error)}`,
      );
    }

    const sandboxId = createResult.data?.data.id;
    if (!sandboxId) {
      throw new Error("No sandbox ID returned from Sandock API");
    }

    // Start the sandbox
    const startResult = (await this.client.POST("/api/v1/sandbox/{id}/start", {
      params: { path: { id: sandboxId } },
    })) as ApiResponse<{ data: { id: string; started: boolean } }>;

    if (startResult.error) {
      throw new Error(
        `Failed to start sandbox: ${JSON.stringify(startResult.error)}`,
      );
    }

    return new SandockHandle(this.client, sandboxId, this.workdir);
  }
}

/**
 * Handle for an active Sandock sandbox
 */
class SandockHandle implements SandboxHandle {
  private readonly client: SandockClient;
  private readonly sandboxId: string;
  private readonly defaultWorkdir: string;

  constructor(
    client: SandockClient,
    sandboxId: string,
    defaultWorkdir: string,
  ) {
    this.client = client;
    this.sandboxId = sandboxId;
    this.defaultWorkdir = defaultWorkdir;
  }

  /**
   * Execute a command in the sandbox and stream the output
   */
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array> {
    const self = this;

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
        if (opts?.env) {
          const validKeyPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
          const envParts = Object.entries(opts.env)
            .filter(([key]) => validKeyPattern.test(key))
            .map(([key, value]) => `export ${key}=${JSON.stringify(value)}`)
            .join(" && ");
          if (envParts) {
            parts.push(envParts);
          }
        }

        // Add the actual command
        parts.push(baseCmd);

        const cmd = parts.join(" && ");

        // Queue for streaming chunks
        const queue: Uint8Array[] = [];
        let done = false;
        let error: Error | null = null;
        let resolveWait: (() => void) | null = null;

        // Start shell command with streaming callbacks
        const shellPromise = self.client.sandbox.shell(self.sandboxId, cmd, {
          onStdout: (chunk: string) => {
            queue.push(new TextEncoder().encode(chunk));
            resolveWait?.();
          },
          onStderr: (chunk: string) => {
            queue.push(new TextEncoder().encode(chunk));
            resolveWait?.();
          },
          onError: (err: unknown) => {
            error = err instanceof Error ? err : new Error(String(err));
            resolveWait?.();
          },
        });

        // Handle completion
        shellPromise
          .then((result) => {
            // Check for errors in the result
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
            done = true;
            resolveWait?.();
          });

        // Yield chunks as they arrive
        while (true) {
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

    // Delete using raw API (no high-level method for delete sandbox)
    const result = (await this.client.DELETE("/api/v1/sandbox/{id}", {
      params: { path: { id: this.sandboxId } },
    })) as ApiResponse<{ data: { id: string; deleted: boolean } }>;

    if (result.error) {
      throw new Error(
        `Failed to delete sandbox: ${JSON.stringify(result.error)}`,
      );
    }
  }
}
