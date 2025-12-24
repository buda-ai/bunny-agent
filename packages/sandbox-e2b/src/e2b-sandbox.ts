import type {
  SandboxAdapter,
  SandboxHandle,
  ExecOptions,
} from "@sandagent/core";

/**
 * Options for creating an E2BSandbox instance
 */
export interface E2BSandboxOptions {
  /** E2B API key (defaults to E2B_API_KEY env var) */
  apiKey?: string;
  /** E2B template to use (default: "base") */
  template?: string;
  /** Timeout for sandbox operations in milliseconds (default: 300000 = 5 min) */
  timeout?: number;
}

/**
 * Type definitions for E2B SDK (e2b package)
 * Based on https://e2b.dev/docs
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
        timeout?: number;
      }
    ): Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>;
  };
  files: {
    write(path: string, content: string | ArrayBuffer): Promise<void>;
    makeDir(path: string): Promise<void>;
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
    opts?: { apiKey?: string }
  ): Promise<E2BSandboxInstance>;
}

// Module registry for optional dependencies
const OPTIONAL_MODULES: Record<string, string> = {
  e2b: "e2b",
};

/**
 * E2B-based sandbox implementation.
 *
 * Uses E2B cloud sandboxes for isolation and execution.
 * Requires the `e2b` package to be installed and E2B_API_KEY to be set.
 *
 * @example
 * ```ts
 * import { E2BSandbox } from "@sandagent/sandbox-e2b";
 *
 * const sandbox = new E2BSandbox({
 *   template: "base",
 *   timeout: 300000,
 * });
 *
 * const handle = await sandbox.attach("session-123");
 * ```
 */
export class E2BSandbox implements SandboxAdapter {
  private readonly apiKey?: string;
  private readonly template: string;
  private readonly timeout: number;
  private readonly instances: Map<string, E2BSandboxInstance> = new Map();

  constructor(options: E2BSandboxOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.E2B_API_KEY;
    this.template = options.template ?? "base";
    this.timeout = options.timeout ?? 300000; // 5 minutes default
  }

  /**
   * Attach to or create a sandbox with the given ID.
   * If a sandbox with this ID already exists in memory, it will be reused.
   */
  async attach(id: string): Promise<SandboxHandle> {
    // Check for API key
    if (!this.apiKey) {
      throw new Error(
        "E2B API key not found. Please set E2B_API_KEY environment variable or pass apiKey option."
      );
    }

    // Check if we already have an instance for this ID
    let instance = this.instances.get(id);

    if (!instance) {
      // Dynamically import E2B SDK
      const E2BSandboxClass = await this.loadE2B();
      
      // Create a new sandbox with metadata to identify it
      instance = await E2BSandboxClass.create({
        apiKey: this.apiKey,
        template: this.template,
        timeoutMs: this.timeout,
        metadata: { sandagentId: id },
      });
      
      this.instances.set(id, instance);
    }

    return new E2BHandle(instance, () => {
      this.instances.delete(id);
    });
  }

  private async loadE2B(): Promise<E2BSandboxStatic> {
    try {
      const modulePath = OPTIONAL_MODULES["e2b"];
      const module = await import(/* webpackIgnore: true */ modulePath);
      return (module.Sandbox ?? module.default) as E2BSandboxStatic;
    } catch (error) {
      throw new Error(
        "E2B SDK not found. Please install e2b: npm install e2b\n" +
          "Documentation: https://e2b.dev/docs"
      );
    }
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
   * Execute a command in the sandbox and stream the output
   */
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array> {
    const self = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        const chunks: Uint8Array[] = [];
        let finished = false;
        let error: Error | null = null;
        let resolveNext: (() => void) | null = null;

        // Start the command
        const commandPromise = self.instance.commands.run(command.join(" "), {
          cwd: opts?.cwd,
          envs: opts?.env,
          onStdout: (data: string) => {
            const chunk = new TextEncoder().encode(data);
            chunks.push(chunk);
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          },
          onStderr: (data: string) => {
            // Log stderr for diagnostics but don't include in main stream
            console.error(`[E2B stderr] ${data}`);
          },
        });

        commandPromise
          .then(() => {
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
            // Return buffered chunks first
            if (chunks.length > 0) {
              return { value: chunks.shift()!, done: false };
            }

            // Check completion states
            if (finished && chunks.length === 0) {
              return { value: undefined, done: true };
            }

            if (error) {
              throw error;
            }

            // Wait for more data
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });

            // Check again after waiting
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

  /**
   * Upload files to the sandbox
   */
  async upload(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string
  ): Promise<void> {
    for (const file of files) {
      const fullPath = `${targetDir}/${file.path}`;

      // Ensure directory exists
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));
      if (dirPath) {
        try {
          await this.instance.files.makeDir(dirPath);
        } catch {
          // Directory might already exist, ignore error
        }
      }

      // Convert Uint8Array to ArrayBuffer if needed
      const content =
        file.content instanceof Uint8Array
          ? (file.content.buffer.slice(
              file.content.byteOffset,
              file.content.byteOffset + file.content.byteLength
            ) as ArrayBuffer)
          : file.content;

      await this.instance.files.write(fullPath, content);
    }
  }

  /**
   * Destroy the sandbox and release resources
   */
  async destroy(): Promise<void> {
    await this.instance.kill();
    this.onDestroy();
  }
}
