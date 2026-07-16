import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import {
  LocalMachine,
  type LocalMachineOptions,
} from "@bunny-agent/sandbox-local";

const require = createRequire(import.meta.url);

/**
 * Isolation policy for {@link SrtSandbox}, mapped onto
 * `@anthropic-ai/sandbox-runtime` (srt) settings.
 *
 * Defaults are deny-by-default where srt is deny-by-default:
 * - Network: fully blocked unless domains are listed in `allowedDomains`.
 * - Filesystem writes: only the sandbox workdir and the OS temp dir are
 *   writable unless more paths are listed in `allowWrite`.
 * - Filesystem reads: allowed except paths listed in `denyRead`.
 */
export interface SrtIsolationOptions {
  /** Domains the sandboxed process may reach (supports `*.example.com`).
   *  Default: `[]` — no network access. */
  allowedDomains?: string[];
  /** Domains to always block (takes precedence over `allowedDomains`). */
  deniedDomains?: string[];
  /** Paths the sandboxed process may NOT read (e.g. `~/.ssh`). */
  denyRead?: string[];
  /** Extra writable paths, in addition to the workdir and the OS temp dir.
   *  Runners that write to the home directory (npm cache, session stores)
   *  need those paths listed here — e.g. `["~/.npm", "~/.bunny-agent"]`. */
  allowWrite?: string[];
  /** Paths to deny writes to even inside allowed paths. */
  denyWrite?: string[];
  /** Allow binding local ports (dev servers inside the sandbox). Default false. */
  allowLocalBinding?: boolean;
  /** Disable Unix-socket blocking (Linux: seccomp; macOS: Seatbelt). Default false. */
  allowAllUnixSockets?: boolean;
  /**
   * Bring-your-own srt settings file. When set, it is passed to srt as-is and
   * every other option in this object is ignored.
   */
  settingsPath?: string;
  /**
   * Override the wrapper invocation (argv prefix). Defaults to running the
   * `srt` CLI bundled with `@anthropic-ai/sandbox-runtime` via the current
   * Node executable.
   */
  srtCommand?: string[];
}

export interface SrtSandboxOptions extends LocalMachineOptions {
  isolation?: SrtIsolationOptions;
}

/**
 * A locally-isolated sandbox: same lifecycle and API as {@link LocalMachine},
 * but every command is wrapped with Anthropic's sandbox runtime
 * (`@anthropic-ai/sandbox-runtime`, the sandbox used by Claude Code), which
 * enforces OS-level boundaries:
 *
 * - Linux: bubblewrap + network-namespace isolation (traffic must go through
 *   srt's host-side proxies)
 * - macOS: `sandbox-exec` with a generated Seatbelt profile
 * - Windows (alpha): a dedicated `srt-sandbox` user account + WFP egress fence
 *
 * The policy is allow-only for network and writes: by default the process
 * can read the filesystem (minus `denyRead`), write only to the workdir and
 * the OS temp dir, and reach no network at all.
 *
 * @example
 * ```typescript
 * import { BunnyAgent } from "@bunny-agent/manager";
 * import { SrtSandbox } from "@bunny-agent/sandbox-srt";
 *
 * const sandbox = new SrtSandbox({
 *   workdir: "/tmp/my-sandbox",
 *   isolation: {
 *     allowedDomains: ["api.anthropic.com", "*.npmjs.org"],
 *     denyRead: ["~/.ssh", "~/.aws"],
 *     allowWrite: ["~/.npm"],
 *   },
 * });
 *
 * const handle = await sandbox.attach();
 * // Runs inside the OS sandbox; writing outside the workdir fails.
 * const result = await handle.runCommand("id && touch out.txt");
 * ```
 */
export class SrtSandbox extends LocalMachine {
  protected override readonly label: string = "SrtSandbox";

  private readonly isolation: SrtIsolationOptions;
  /** Generated settings file path; created lazily, stable per instance. */
  private settingsFilePromise: Promise<string> | null = null;

  constructor(options: SrtSandboxOptions = {}) {
    super(options);
    this.isolation = options.isolation ?? {};
  }

  protected override async transformCommand(
    command: string[],
  ): Promise<string[]> {
    const settingsPath =
      this.isolation.settingsPath ?? (await this.ensureSettingsFile());
    const srtCommand = this.isolation.srtCommand ?? [
      process.execPath,
      require.resolve("@anthropic-ai/sandbox-runtime/dist/cli.js"),
    ];
    return [...srtCommand, "--settings", settingsPath, ...command];
  }

  /**
   * Write the srt settings file derived from {@link SrtIsolationOptions}.
   * The file lives under the OS temp dir, which is inside the sandbox's
   * writable paths — so the policy explicitly denies writes to its own
   * directory (`denyWrite` takes precedence over `allowWrite` in srt): a
   * sandboxed process cannot edit its own policy for the next run.
   */
  private ensureSettingsFile(): Promise<string> {
    this.settingsFilePromise ??= (async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "srt-sandbox-"));
      const settingsPath = path.join(dir, "srt-settings.json");
      const settings = {
        network: {
          allowedDomains: this.isolation.allowedDomains ?? [],
          deniedDomains: this.isolation.deniedDomains ?? [],
          allowLocalBinding: this.isolation.allowLocalBinding ?? false,
          allowAllUnixSockets: this.isolation.allowAllUnixSockets ?? false,
        },
        filesystem: {
          denyRead: this.isolation.denyRead ?? [],
          allowWrite: [
            this.getWorkdir(),
            os.tmpdir(),
            ...(this.isolation.allowWrite ?? []),
          ],
          // The policy file itself (and its directory) must never be
          // writable from inside the sandbox, even though it lives under
          // the OS temp dir.
          denyWrite: [dir, ...(this.isolation.denyWrite ?? [])],
        },
      };
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
      console.log(`[${this.label}] Wrote srt settings: ${settingsPath}`);
      return settingsPath;
    })();
    return this.settingsFilePromise;
  }
}
