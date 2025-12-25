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
    const createResult = (await this.client.POST("/api/sandbox", {
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
    const startResult = (await this.client.POST("/api/sandbox/{id}/start", {
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
        // Build command string
        const cmd = command.length === 1 ? command[0] : command;

        // Execute shell command via Sandock API
        const result = (await self.client.POST("/api/sandbox/{id}/shell", {
          params: { path: { id: self.sandboxId } },
          body: {
            cmd,
            workdir: opts?.cwd ?? self.defaultWorkdir,
            env: opts?.env,
            timeoutMs: opts?.timeout ? opts.timeout * 1000 : undefined,
          },
        })) as ApiResponse<{
          data: {
            stdout: string;
            stderr: string;
            exitCode: number | null;
            timedOut: boolean;
            durationMs: number;
          };
        }>;

        if (result.error) {
          throw new Error(
            `Shell command failed: ${JSON.stringify(result.error)}`,
          );
        }

        const data = result.data?.data;
        if (!data) {
          return;
        }

        // Yield stdout
        if (data.stdout) {
          yield new TextEncoder().encode(data.stdout);
        }

        // Yield stderr (if any)
        if (data.stderr) {
          yield new TextEncoder().encode(data.stderr);
        }

        // Check exit code
        if (data.exitCode !== 0 && data.exitCode !== null) {
          console.warn(`Command exited with code ${data.exitCode}`);
        }

        if (data.timedOut) {
          throw new Error(`Command timed out after ${data.durationMs}ms`);
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

      const result = (await this.client.POST("/api/sandbox/{id}/fs/write", {
        params: { path: { id: this.sandboxId } },
        body: {
          path: fullPath,
          content,
        },
      })) as ApiResponse<{ data: boolean }>;

      if (result.error) {
        throw new Error(
          `Failed to write file ${fullPath}: ${JSON.stringify(result.error)}`,
        );
      }
    }
  }

  /**
   * Destroy the sandbox and release resources
   */
  async destroy(): Promise<void> {
    // Stop the sandbox first
    await this.client.POST("/api/sandbox/{id}/stop", {
      params: { path: { id: this.sandboxId } },
    });

    // Then delete it
    const result = (await this.client.DELETE("/api/sandbox/{id}", {
      params: { path: { id: this.sandboxId } },
    })) as ApiResponse<{ data: { id: string; deleted: boolean } }>;

    if (result.error) {
      throw new Error(
        `Failed to delete sandbox: ${JSON.stringify(result.error)}`,
      );
    }
  }
}
