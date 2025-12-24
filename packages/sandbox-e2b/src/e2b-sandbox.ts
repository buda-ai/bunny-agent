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
  /** E2B template to use */
  template?: string;
  /** Timeout for sandbox operations in milliseconds */
  timeout?: number;
}

// Type definitions for E2B SDK
interface E2BSandboxInstance {
  process: {
    start(opts: {
      cmd: string;
      cwd?: string;
      envs?: Record<string, string>;
      onStdout?: (chunk: { line: string }) => void;
      onStderr?: (chunk: { line: string }) => void;
    }): Promise<{ wait(): Promise<{ exitCode: number }> }>;
  };
  filesystem: {
    write(path: string, content: string | Uint8Array): Promise<void>;
    makeDir(path: string): Promise<void>;
  };
  close(): Promise<void>;
}

interface E2BSandboxConstructor {
  create(opts?: { apiKey?: string; template?: string; timeout?: number }): Promise<E2BSandboxInstance>;
}

/**
 * E2B-based sandbox implementation.
 *
 * Uses E2B cloud sandboxes for isolation and execution.
 */
export class E2BSandbox implements SandboxAdapter {
  private readonly apiKey?: string;
  private readonly template: string;
  private readonly timeout: number;
  private readonly instances: Map<string, E2BSandboxInstance> = new Map();

  constructor(options: E2BSandboxOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.E2B_API_KEY;
    this.template = options.template ?? "base";
    this.timeout = options.timeout ?? 60000;
  }

  /**
   * Attach to or create a sandbox with the given ID
   */
  async attach(id: string): Promise<SandboxHandle> {
    // Check if we already have an instance for this ID
    let instance = this.instances.get(id);

    if (!instance) {
      // Dynamically import E2B SDK
      const e2b = await this.loadE2B();
      instance = await e2b.create({
        apiKey: this.apiKey,
        template: this.template,
        timeout: this.timeout,
      });
      this.instances.set(id, instance);
    }

    return new E2BHandle(instance, () => {
      this.instances.delete(id);
    });
  }

  private async loadE2B(): Promise<E2BSandboxConstructor> {
    try {
      // Use dynamic import with a variable to avoid TypeScript static analysis
      const moduleName = "@e2b/code-interpreter";
      const module = await (Function('moduleName', 'return import(moduleName)')(moduleName) as Promise<Record<string, unknown>>);
      return (module.Sandbox ?? module.default) as E2BSandboxConstructor;
    } catch {
      throw new Error(
        "E2B SDK not found. Please install @e2b/code-interpreter: npm install @e2b/code-interpreter"
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
  exec(
    command: string[],
    opts?: ExecOptions
  ): AsyncIterable<Uint8Array> {
    const self = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        const chunks: Uint8Array[] = [];
        let finished = false;
        let error: Error | null = null;
        let resolveNext: (() => void) | null = null;

        // Start the process
        const processPromise = self.instance.process.start({
          cmd: command.join(" "),
          cwd: opts?.cwd,
          envs: opts?.env,
          onStdout: (chunk) => {
            const data = new TextEncoder().encode(chunk.line + "\n");
            chunks.push(data);
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          },
          onStderr: () => {
            // Stderr goes to diagnostics, not the stream
          },
        });

        processPromise
          .then((proc) => proc.wait())
          .then(() => {
            finished = true;
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          })
          .catch((err) => {
            error = err;
            if (resolveNext) {
              resolveNext();
              resolveNext = null;
            }
          });

        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            // If there are buffered chunks, return the first one
            if (chunks.length > 0) {
              return { value: chunks.shift()!, done: false };
            }

            // If finished and no more chunks, we're done
            if (finished && chunks.length === 0) {
              return { value: undefined, done: true };
            }

            // If there's an error, throw it
            if (error) {
              throw error;
            }

            // Wait for more data
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });

            // Check again
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
        await this.instance.filesystem.makeDir(dirPath);
      }

      await this.instance.filesystem.write(fullPath, file.content);
    }
  }

  /**
   * Destroy the sandbox and release resources
   */
  async destroy(): Promise<void> {
    await this.instance.close();
    this.onDestroy();
  }
}
