import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@sandagent/core";
import { Sandbox as E2BSandboxClass } from "e2b";

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
  /** Path to runner bundle.js (required for running sandagent) */
  runnerBundlePath?: string;
  /** Path to templates directory */
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
        timeout?: number;
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
 * E2B-based sandbox implementation.
 */
export class E2BSandbox implements SandboxAdapter {
  private readonly apiKey?: string;
  private readonly template: string;
  private readonly timeout: number;
  private readonly runnerBundlePath?: string;
  private readonly templatesPath?: string;
  private readonly instances: Map<string, E2BSandboxInstance> = new Map();
  private readonly initializedInstances: Set<string> = new Set();

  constructor(options: E2BSandboxOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.E2B_API_KEY;
    this.template = options.template ?? "base";
    this.timeout = options.timeout ?? 300000;
    this.runnerBundlePath = options.runnerBundlePath;
    this.templatesPath = options.templatesPath;
  }

  async attach(id: string): Promise<SandboxHandle> {
    if (!this.apiKey) {
      throw new Error(
        "E2B API key not found. Please set E2B_API_KEY environment variable or pass apiKey option.",
      );
    }

    let instance = this.instances.get(id);
    let needsInit = false;

    if (!instance) {
      instance = await E2BSandboxClass.create(this.template, {
        apiKey: this.apiKey,
        timeoutMs: this.timeout,
        metadata: { sandagentId: id },
      }) as unknown as E2BSandboxInstance;
      this.instances.set(id, instance);
      needsInit = true;
    }

    const handle = new E2BHandle(instance, () => {
      this.instances.delete(id);
      this.initializedInstances.delete(id);
    });

    // Upload runner and templates on first attach
    if (needsInit && !this.initializedInstances.has(id)) {
      await this.initializeSandbox(handle, id);
      this.initializedInstances.add(id);
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

    // Upload templates
    if (this.templatesPath && fs.existsSync(this.templatesPath)) {
      const templateFiles = this.collectFiles(this.templatesPath, "templates");
      filesToUpload.push(...templateFiles);
      console.log(
        `[E2B] Uploading ${templateFiles.length} template files to sandbox ${id}`,
      );
    }

    if (filesToUpload.length > 0) {
      await handle.upload(filesToUpload, "/sandagent");

      // Install claude-agent-sdk in sandbox
      console.log(
        `[E2B] Installing @anthropic-ai/claude-agent-sdk in sandbox ${id}`,
      );
      const installResult = await handle.runCommand(
        "npm install -g @anthropic-ai/claude-agent-sdk",
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
      const relativePath = `${prefix}/${entry.name}`;

      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
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

    return {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        const chunks: Uint8Array[] = [];
        let finished = false;
        let error: Error | null = null;
        let resolveNext: (() => void) | null = null;

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
    await this.instance.kill();
    this.onDestroy();
  }
}
