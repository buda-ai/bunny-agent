import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SandboxHandle } from "@bunny-agent/manager";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SrtSandbox } from "../srt-sandbox.js";

/**
 * These are real isolation tests: they execute commands through the actual
 * srt wrapper (bubblewrap on Linux, Seatbelt on macOS). They are skipped on
 * hosts where the platform sandboxing primitive is unavailable (e.g. Linux
 * without bubblewrap installed, CI containers without user namespaces).
 */
const sandboxingAvailable = (() => {
  if (process.platform === "darwin") {
    return true; // sandbox-exec ships with macOS
  }
  if (process.platform === "linux") {
    try {
      // srt needs bwrap (with permission to create user namespaces — on
      // Ubuntu 24.04+ that requires an AppArmor profile or
      // kernel.apparmor_restrict_unprivileged_userns=0), socat for its
      // network proxy bridge, and ripgrep.
      execFileSync("bwrap", ["--ro-bind", "/", "/", "true"], {
        stdio: "ignore",
        timeout: 10000,
      });
      execFileSync("socat", ["-V"], { stdio: "ignore", timeout: 10000 });
      execFileSync("rg", ["--version"], { stdio: "ignore", timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
  return false;
})();

/** Run a shell script through the sandbox's primary exec() path. exec()
 *  throws on non-zero exit, which is exactly the signal these tests assert. */
async function run(
  handle: SandboxHandle,
  script: string,
): Promise<{ ok: boolean; output: string }> {
  const chunks: string[] = [];
  try {
    for await (const chunk of handle.exec(["sh", "-c", script])) {
      chunks.push(new TextDecoder().decode(chunk));
    }
    return { ok: true, output: chunks.join("") };
  } catch {
    return { ok: false, output: chunks.join("") };
  }
}

describe.skipIf(!sandboxingAvailable)("SrtSandbox (real isolation)", () => {
  let workdir: string;
  let outsideDir: string;

  beforeEach(async () => {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), "srt-sandbox-wd-"));
    // A directory the policy does NOT allow writes to. It must live outside
    // the OS temp dir (which SrtSandbox always allows) — and the repo itself
    // can sit under the temp dir (e.g. a /tmp git worktree), so anchor to
    // the user's home rather than process.cwd(). Removed in afterEach.
    outsideDir = await fs.mkdtemp(
      path.join(os.homedir(), ".srt-test-outside-"),
    );
  });

  afterEach(async () => {
    await fs.rm(workdir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(outsideDir, { recursive: true, force: true }).catch(() => {});
  });

  it("runs commands and allows writes inside the workdir", async () => {
    const sandbox = new SrtSandbox({ workdir });
    const handle = await sandbox.attach();

    const result = await run(
      handle,
      "echo sandboxed-ok > inside.txt && cat inside.txt",
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("sandboxed-ok");

    // The write really landed on the host filesystem.
    const content = await fs.readFile(path.join(workdir, "inside.txt"), "utf8");
    expect(content).toContain("sandboxed-ok");
  }, 120000);

  it("denies writes outside the allowed paths", async () => {
    const sandbox = new SrtSandbox({ workdir });
    const handle = await sandbox.attach();

    const target = path.join(outsideDir, "escape.txt");
    const result = await run(handle, `touch ${target}`);
    expect(result.ok).toBe(false);

    await expect(fs.access(target)).rejects.toThrow();
  }, 120000);

  it("denies reads of paths listed in denyRead", async () => {
    const secretDir = path.join(outsideDir, "secrets");
    await fs.mkdir(secretDir, { recursive: true });
    await fs.writeFile(path.join(secretDir, "key.txt"), "top-secret");

    const sandbox = new SrtSandbox({
      workdir,
      isolation: { denyRead: [secretDir] },
    });
    const handle = await sandbox.attach();

    const result = await run(handle, `cat ${secretDir}/key.txt`);
    expect(result.ok).toBe(false);
    expect(result.output).not.toContain("top-secret");
  }, 120000);

  it("blocks network access by default", async () => {
    const sandbox = new SrtSandbox({ workdir });
    const handle = await sandbox.attach();

    // 5s timeout so a (wrongly) reachable network still fails fast.
    const result = await run(
      handle,
      "curl -sS --max-time 5 https://example.com",
    );
    expect(result.ok).toBe(false);
  }, 120000);

  it("sandboxed process cannot rewrite its own policy file", async () => {
    const sandbox = new SrtSandbox({ workdir });
    const handle = await sandbox.attach();

    // Locate the generated settings file via the wrapper command itself:
    // it is passed as `--settings <path>` and lives under an srt-sandbox-*
    // temp dir that the policy denies writes to.
    const probe = await run(handle, "echo policy-probe");
    expect(probe.ok).toBe(true);

    const dirs = await fs.readdir(os.tmpdir());
    const policyDirs = dirs.filter((d) => d.startsWith("srt-sandbox-"));
    expect(policyDirs.length).toBeGreaterThan(0);

    let deniedSomewhere = false;
    for (const dir of policyDirs) {
      const settingsPath = path.join(os.tmpdir(), dir, "srt-settings.json");
      const result = await run(handle, `echo '{}' > ${settingsPath}`);
      if (!result.ok) {
        deniedSomewhere = true;
      }
    }
    expect(deniedSomewhere).toBe(true);
  }, 120000);
});
