import { spawn } from "child_process";
import type {
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@sandagent/core";

/**
 * Options for creating a SandockSandbox instance
 */
export interface SandockSandboxOptions {
  /** Docker image to use for the sandbox */
  image?: string;
  /** Volume prefix for persistent storage */
  volumePrefix?: string;
  /** Network mode for the container */
  networkMode?: "none" | "bridge" | "host";
  /** Additional Docker run arguments */
  dockerArgs?: string[];
}

/**
 * Sandock-based sandbox implementation.
 *
 * Uses Docker containers for isolation and persistent volumes
 * for filesystem state.
 */
export class SandockSandbox implements SandboxAdapter {
  private readonly image: string;
  private readonly volumePrefix: string;
  private readonly networkMode: string;
  private readonly dockerArgs: string[];

  constructor(options: SandockSandboxOptions = {}) {
    this.image = options.image ?? "node:20-slim";
    this.volumePrefix = options.volumePrefix ?? "sandagent";
    this.networkMode = options.networkMode ?? "bridge";
    this.dockerArgs = options.dockerArgs ?? [];
  }

  /**
   * Attach to or create a sandbox with the given ID
   */
  async attach(id: string): Promise<SandboxHandle> {
    const volumeName = `${this.volumePrefix}-${id}`;
    const containerName = `${this.volumePrefix}-${id}`;

    // Ensure volume exists
    await this.ensureVolume(volumeName);

    // Check if container exists and is running
    const containerExists = await this.containerExists(containerName);

    if (!containerExists) {
      // Start a new container
      await this.startContainer(containerName, volumeName);
    }

    return new SandockHandle(containerName);
  }

  private async ensureVolume(volumeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn("docker", ["volume", "create", volumeName], {
        stdio: "pipe",
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to create volume: ${volumeName}`));
        }
      });

      proc.on("error", reject);
    });
  }

  private async containerExists(containerName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn("docker", ["container", "inspect", containerName], {
        stdio: "pipe",
      });

      proc.on("close", (code) => {
        resolve(code === 0);
      });

      proc.on("error", () => {
        resolve(false);
      });
    });
  }

  private async startContainer(
    containerName: string,
    volumeName: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        "run",
        "-d",
        "--name",
        containerName,
        "--network",
        this.networkMode,
        "-v",
        `${volumeName}:/workspace`,
        ...this.dockerArgs,
        this.image,
        "tail",
        "-f",
        "/dev/null", // Keep container running
      ];

      const proc = spawn("docker", args, { stdio: "pipe" });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to start container: ${containerName}`));
        }
      });

      proc.on("error", reject);
    });
  }
}

/**
 * Handle for an active Sandock container
 */
class SandockHandle implements SandboxHandle {
  private readonly containerName: string;

  constructor(containerName: string) {
    this.containerName = containerName;
  }

  /**
   * Execute a command in the sandbox and stream the output
   */
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array> {
    const self = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        const args = ["exec"];

        // Add working directory if specified
        if (opts?.cwd) {
          args.push("-w", opts.cwd);
        }

        // Add environment variables if specified
        if (opts?.env) {
          for (const [key, value] of Object.entries(opts.env)) {
            args.push("-e", `${key}=${value}`);
          }
        }

        args.push(self.containerName, ...command);

        const proc = spawn("docker", args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        const stdout = proc.stdout;

        return {
          async next(): Promise<IteratorResult<Uint8Array>> {
            return new Promise((resolve, reject) => {
              const onData = (chunk: Buffer) => {
                cleanup();
                resolve({ value: new Uint8Array(chunk), done: false });
              };

              const onEnd = () => {
                cleanup();
                resolve({ value: undefined, done: true });
              };

              const onError = (err: Error) => {
                cleanup();
                reject(err);
              };

              const cleanup = () => {
                stdout.removeListener("data", onData);
                stdout.removeListener("end", onEnd);
                stdout.removeListener("error", onError);
              };

              stdout.once("data", onData);
              stdout.once("end", onEnd);
              stdout.once("error", onError);
            });
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
    targetDir: string,
  ): Promise<void> {
    for (const file of files) {
      const fullPath = `${targetDir}/${file.path}`;

      // Use base64 encoding for binary content to avoid corruption
      if (typeof file.content === "string") {
        await this.execCommand(
          [
            "sh",
            "-c",
            `mkdir -p $(dirname "${fullPath}") && cat > "${fullPath}"`,
          ],
          file.content,
        );
      } else {
        // For binary content, use base64 encoding to preserve data integrity
        const base64Content = Buffer.from(file.content).toString("base64");
        await this.execCommand([
          "sh",
          "-c",
          `mkdir -p $(dirname "${fullPath}") && echo "${base64Content}" | base64 -d > "${fullPath}"`,
        ]);
      }
    }
  }

  private async execCommand(command: string[], stdin?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ["exec", "-i", this.containerName, ...command];
      const proc = spawn("docker", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (stdin) {
        proc.stdin.write(stdin);
        proc.stdin.end();
      }

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });

      proc.on("error", reject);
    });
  }

  /**
   * Destroy the sandbox and release resources
   */
  async destroy(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn("docker", ["rm", "-f", this.containerName], {
        stdio: "pipe",
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`Failed to destroy container: ${this.containerName}`),
          );
        }
      });

      proc.on("error", reject);
    });
  }
}
