import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import type { SandboxHandle } from "@bunny-agent/manager";
import {
  LocalMachine,
  type LocalMachineOptions,
} from "@bunny-agent/sandbox-local";

const require = createRequire(import.meta.url);

/** The exact prefix srt uses when a required platform binary (bubblewrap,
 *  socat, ripgrep, ...) is missing — confirmed against
 *  `@anthropic-ai/sandbox-runtime@0.0.65` by a live repro with those
 *  binaries hidden from PATH. Matching on this signature (rather than
 *  guessing at srt's exact dependency list ourselves, which could drift out
 *  of sync with a future srt version) lets SrtSandbox tell "you're missing
 *  a dependency" apart from "the sandbox failed to start for some other
 *  reason" without duplicating srt's own platform-requirements logic. */
const MISSING_DEPS_SIGNATURE = "Sandbox dependencies not available";

/** Package names to suggest installing, keyed by the dependency name
 *  substring srt's own error message uses (see MISSING_DEPS_SIGNATURE's
 *  doc comment — these are read out of srt's message, not asserted
 *  independently, so an unlisted dependency just gets no extra hint
 *  rather than a wrong one). `bubblewrap` has no `brew` entry: it's a
 *  Linux-only sandboxing primitive, macOS uses Seatbelt instead. */
const DEPENDENCY_PACKAGE_NAMES: Record<
  string,
  { apt?: string; brew?: string }
> = {
  ripgrep: { apt: "ripgrep", brew: "ripgrep" },
  bubblewrap: { apt: "bubblewrap" },
  socat: { apt: "socat", brew: "socat" },
};

/**
 * Builds an actionable "how to fix this" hint appended to srt's own missing-
 * dependency message. Only mentions dependencies srt's message actually
 * named (never asserts what's needed on a platform we haven't confirmed).
 * Exported for direct unit testing — not part of the package's public API.
 */
export function buildInstallHint(srtMessage: string): string {
  const lowerMessage = srtMessage.toLowerCase();
  const missing = Object.keys(DEPENDENCY_PACKAGE_NAMES).filter((name) =>
    lowerMessage.includes(name),
  );
  if (missing.length === 0) {
    return "";
  }

  const aptPackages = missing
    .map((name) => DEPENDENCY_PACKAGE_NAMES[name].apt)
    .filter((pkg): pkg is string => Boolean(pkg));
  const brewPackages = missing
    .map((name) => DEPENDENCY_PACKAGE_NAMES[name].brew)
    .filter((pkg): pkg is string => Boolean(pkg));

  const lines = ["", "To fix:"];
  if (aptPackages.length > 0) {
    lines.push(
      `  Debian/Ubuntu: sudo apt-get install -y ${aptPackages.join(" ")}`,
    );
  }
  if (brewPackages.length > 0) {
    lines.push(`  macOS:         brew install ${brewPackages.join(" ")}`);
  }
  if (missing.includes("bubblewrap")) {
    lines.push(
      "  Ubuntu 24.04+ additionally restricts unprivileged user namespaces by " +
        "default, which bubblewrap needs — either " +
        "`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` or grant " +
        "an AppArmor profile permitting bwrap's `userns` (see docs/SANDBOX_ADAPTERS.md).",
    );
  }
  return lines.join("\n");
}

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
  /** The mkdtemp'd directory holding the generated settings file — tracked
   *  separately so onDestroy() can remove it without re-deriving it from
   *  the (possibly not-yet-created) settings path. */
  private generatedSettingsDir: string | null = null;

  constructor(options: SrtSandboxOptions = {}) {
    super(options);
    this.isolation = options.isolation ?? {};
  }

  /**
   * Runs a cheap srt-wrapped no-op before doing any real work, so a missing
   * platform dependency (bubblewrap, socat, ripgrep, ...) or an otherwise
   * unusable sandbox surfaces immediately with an actionable message —
   * instead of being discovered deep inside the first real `exec()` call,
   * where it previously arrived as a generic "Command failed (exit 1)"
   * with srt's raw stderr buried in the trace.
   */
  override async attach(): Promise<SandboxHandle> {
    if (!this.getHandle()) {
      await this.preflightCheck();
    }
    return super.attach();
  }

  private async preflightCheck(): Promise<void> {
    const settingsPath =
      this.isolation.settingsPath ?? (await this.ensureSettingsFile());
    const srtCommand = this.isolation.srtCommand ?? [
      process.execPath,
      require.resolve("@anthropic-ai/sandbox-runtime/dist/cli.js"),
    ];
    // A harmless payload: node itself is guaranteed present (we're running
    // inside it right now), so the probe doesn't depend on `true`/`echo`
    // existing, and it touches neither the filesystem nor the network.
    const [cmd, ...args] = [
      ...srtCommand,
      "--settings",
      settingsPath,
      process.execPath,
      "-e",
      "process.exit(0)",
    ];

    await new Promise<void>((resolve, reject) => {
      execFile(cmd, args, { timeout: 15000 }, (error, _stdout, stderr) => {
        if (!error) {
          resolve();
          return;
        }
        const message = (stderr || error.message).trim();
        if (message.includes(MISSING_DEPS_SIGNATURE)) {
          reject(
            new Error(
              `SrtSandbox cannot start: ${message}${buildInstallHint(message)}`,
            ),
          );
          return;
        }
        reject(
          new Error(
            "SrtSandbox failed its startup preflight check (this usually means " +
              "the sandboxing runtime — bubblewrap on Linux, Seatbelt on macOS — " +
              `can't run in this environment): ${message}`,
          ),
        );
      });
    });
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
      this.generatedSettingsDir = dir;
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

  /**
   * Removes the generated `srt-sandbox-*` settings directory, if one was
   * created (bring-your-own `settingsPath` never triggers this). Without
   * this, every SrtSandbox instance that actually ran a command leaked one
   * temp directory under the OS temp dir for the lifetime of the host —
   * across many agent runs (each gets its own SrtSandbox instance) these
   * accumulate indefinitely.
   */
  protected override async onDestroy(): Promise<void> {
    if (this.generatedSettingsDir) {
      await fs.rm(this.generatedSettingsDir, { recursive: true, force: true });
    }
  }
}
