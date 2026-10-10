import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@bunny-agent/manager";
import { type ConnectOptions, Machine } from "smolmachines";

export interface SmolSandboxOptions {
  /** Run the VM locally by default, or in Smol Cloud. Cloud uses SMOL_CLOUD_TOKEN or the smol CLI login. */
  target?: "local" | "cloud";
  /** A stable name reuses a disk-preserving VM across sessions. Omit to delete on destroy. */
  name?: string;
  /** OCI image with Node and npm available (default: node:22-slim). */
  image?: string;
  /** Path to local agent template files, uploaded once on VM creation. */
  templatesPath?: string;
  /** Environment variables passed to every execution, including the agent runner. */
  env?: Record<string, string>;
  /** Execution directory inside the VM. */
  workdir?: string;
  /** Cloud API key; the SDK otherwise uses SMOL_CLOUD_TOKEN or the smol CLI login. */
  apiKey?: string;
  /** VM memory in MiB. */
  memoryMb?: number;
  /** VM virtual CPUs. */
  cpus?: number;
  /** Idle seconds before the cloud VM auto-stops (default 1800). */
  autoStopSeconds?: number;
  /** Cloud machine lifetime in seconds (default 7200 for unnamed VMs, unlimited for named VMs). */
  ttlSeconds?: number;
}

const RUNNER_PACKAGE = "@bunny-agent/runner-cli@latest";
const LABELS = { "bunny-agent-adapter": "smol" };

function machineName(name: string): string {
  return `bunny-${createHash("sha256").update(name).digest("hex").slice(0, 24)}`;
}

function checkedPath(targetDir: string, filePath: string): string {
  if (
    !path.posix.isAbsolute(targetDir) ||
    filePath.includes("\0") ||
    path.posix.isAbsolute(filePath)
  ) {
    throw new Error(
      "Sandbox uploads require an absolute target and a relative file path",
    );
  }
  const relative = filePath.split("/");
  if (
    relative.some(
      (segment) => segment === ".." || segment === "" || segment === ".",
    )
  ) {
    throw new Error(`Invalid sandbox upload path: ${filePath}`);
  }
  return path.posix.join(targetDir, filePath);
}

function templateFiles(
  root: string,
): Array<{ path: string; content: Uint8Array }> {
  const files: Array<{ path: string; content: Uint8Array }> = [];
  function visit(dir: string, prefix: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile())
        files.push({ path: relative, content: fs.readFileSync(absolute) });
    }
  }
  visit(root, "");
  return files;
}

class SmolHandle implements SandboxHandle {
  private destroyed = false;

  constructor(
    private readonly machine: Machine,
    private readonly workdir: string,
    private readonly env: Record<string, string>,
    private readonly reusable: boolean,
    private readonly onDestroy: () => void,
  ) {}

  getSandboxId(): string {
    return this.machine.id;
  }
  getVolumes(): null {
    return null;
  }
  getWorkdir(): string {
    return this.workdir;
  }

  async *exec(
    command: string[],
    opts?: ExecOptions,
  ): AsyncIterable<Uint8Array> {
    if (this.destroyed)
      throw new Error("Smol sandbox handle has been destroyed");
    let stderr = "";
    let exited = false;
    const env = {
      ...this.env,
      ...opts?.env,
      NODE_PATH: opts?.env?.NODE_PATH ?? `${this.workdir}/node_modules`,
      PATH:
        opts?.env?.PATH ??
        `${this.workdir}/node_modules/.bin:/usr/local/bin:/usr/bin:/bin`,
    };
    for await (const event of this.machine.execStream(command, {
      workdir: opts?.cwd ?? this.workdir,
      env,
      timeout:
        opts?.timeout == null ? undefined : Math.ceil(opts.timeout / 1000),
      signal: opts?.signal,
    })) {
      if (event.kind === "stdout") yield Buffer.from(event.data);
      else if (event.kind === "stderr")
        stderr = (stderr + event.data).slice(-8192);
      else if (event.kind === "error") throw new Error(event.message);
      else {
        exited = true;
        if (event.exitCode !== 0)
          throw new Error(
            `Smol command exited with code ${event.exitCode}: ${stderr}`,
          );
      }
    }
    if (!exited)
      throw new Error("Smol command stream ended without an exit status");
  }

  async upload(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string,
  ): Promise<void> {
    if (this.destroyed)
      throw new Error("Smol sandbox handle has been destroyed");
    for (const file of files) {
      const target = checkedPath(targetDir, file.path);
      const parent = path.posix.dirname(target);
      const mkdir = await this.machine.exec(["mkdir", "-p", parent]);
      if (mkdir.exitCode !== 0)
        throw new Error(`Could not create ${parent}: ${mkdir.stderr}`);
      await this.machine.writeFile(target, file.content);
    }
  }

  async readFile(filePath: string): Promise<string> {
    if (this.destroyed)
      throw new Error("Smol sandbox handle has been destroyed");
    return (await this.machine.readFile(filePath)).toString("utf8");
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    if (this.reusable) {
      const state = await this.machine.state();
      if (state !== "stopped" && state !== "paused") await this.machine.stop();
    } else await this.machine.delete();
    this.destroyed = true;
    this.onDestroy();
  }
}

/** Runs Bunny Agent inside a local microVM or Smol Cloud using the same adapter interface. */
export class SmolSandbox implements SandboxAdapter {
  private handle: SmolHandle | null = null;
  private readonly target: "local" | "cloud";
  private readonly workdir: string;
  private readonly image: string;

  constructor(private readonly options: SmolSandboxOptions = {}) {
    this.target = options.target ?? "local";
    this.workdir = options.workdir ?? "/workspace";
    this.image = options.image ?? "node:22-slim";
    if (!path.posix.isAbsolute(this.workdir))
      throw new Error("Smol workdir must be absolute");
    if (options.name !== undefined && !options.name.trim())
      throw new Error("Smol sandbox name must not be empty");
  }

  getEnv(): Record<string, string> {
    return this.options.env ?? {};
  }
  getWorkdir(): string {
    return this.workdir;
  }
  getRunnerCommand(): string[] {
    return [`${this.workdir}/node_modules/.bin/bunny-agent-runner`, "run"];
  }
  getHandle(): SandboxHandle | null {
    return this.handle;
  }

  async attach(): Promise<SandboxHandle> {
    if (this.handle) return this.handle;
    if (this.attachPromise) return this.attachPromise;
    this.attachPromise = this.attachMachine();
    try {
      return await this.attachPromise;
    } finally {
      this.attachPromise = undefined;
    }
  }

  private attachPromise?: Promise<SmolHandle>;

  private async attachMachine(): Promise<SmolHandle> {
    const conn: ConnectOptions = {
      target: this.target,
      ...(this.options.apiKey ? { apiKey: this.options.apiKey } : {}),
    };
    let machine: Machine | undefined;
    let created = false;
    const name = this.options.name;
    if (name) {
      if (this.target === "local") {
        try {
          machine = await Machine.connect(machineName(name), conn);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !/not found|does not exist/i.test(error.message)
          )
            throw error;
        }
      } else {
        const existing = await Machine.list(conn, {
          labels: { ...LABELS, "bunny-agent-name": machineName(name) },
        });
        const candidate = existing.find(
          (item) => item.state !== "deleted" && item.state !== "deleting",
        );
        if (candidate) {
          machine = await Machine.connect(candidate.id, conn);
          if (candidate.state === "paused") await machine.resume();
          else if (
            candidate.state !== "running" &&
            candidate.state !== "started"
          )
            await machine.start();
          await machine.waitUntilReady();
        }
      }
    }
    if (!machine) {
      const requestedName = name
        ? machineName(name)
        : `bunny-${randomUUID().slice(0, 16)}`;
      machine = await Machine.create(
        {
          name: requestedName,
          image: this.image,
          resources: {
            cpus: this.options.cpus ?? 2,
            memoryMb: this.options.memoryMb ?? 2048,
            network: true,
          },
          ...(name
            ? {
                persistent: true,
                ...(this.target === "local" ? { detach: true } : {}),
              }
            : {}),
          ...(this.target === "cloud"
            ? {
                autoStopSeconds: this.options.autoStopSeconds ?? 1800,
                ...(!name || this.options.ttlSeconds !== undefined
                  ? { ttlSeconds: this.options.ttlSeconds ?? 7200 }
                  : {}),
              }
            : {}),
          labels: {
            ...LABELS,
            ...(name ? { "bunny-agent-name": machineName(name) } : {}),
          },
        },
        conn,
      );
      created = true;
    }
    try {
      const handle = new SmolHandle(
        machine,
        this.workdir,
        this.getEnv(),
        Boolean(name),
        () => {
          this.handle = null;
        },
      );
      const mkdir = await machine.exec(["mkdir", "-p", this.workdir]);
      if (mkdir.exitCode !== 0)
        throw new Error(`Could not create sandbox workdir: ${mkdir.stderr}`);
      const runner = await machine.exec([
        "test",
        "-x",
        `${this.workdir}/node_modules/.bin/bunny-agent-runner`,
      ]);
      if (runner.exitCode !== 0) {
        const install = await machine.exec(
          [
            "npm",
            "install",
            "--no-audit",
            "--no-fund",
            "--prefer-offline",
            RUNNER_PACKAGE,
          ],
          {
            workdir: this.workdir,
            timeout: 600,
          },
        );
        if (install.exitCode !== 0)
          throw new Error(
            `Could not install Bunny Agent runner: ${install.stderr}`,
          );
      }
      const installedRunner = await machine.exec([
        "test",
        "-x",
        `${this.workdir}/node_modules/.bin/bunny-agent-runner`,
      ]);
      if (installedRunner.exitCode !== 0) {
        throw new Error(
          "Bunny Agent runner binary is missing after installation",
        );
      }
      if (created && this.options.templatesPath) {
        await handle.upload(
          templateFiles(this.options.templatesPath),
          this.workdir,
        );
      }
      this.handle = handle;
      return handle;
    } catch (error) {
      if (created) await machine.delete().catch(() => {});
      throw error;
    }
  }
}
