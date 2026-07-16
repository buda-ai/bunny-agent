import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SandboxHandle } from "@bunny-agent/manager";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildInstallHint, SrtSandbox } from "../srt-sandbox.js";

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

  it("abort/timeout leaves no orphaned grandchild process (PID namespace)", async () => {
    // LocalMachine (no isolation) needs its own process-group kill logic to
    // catch backgrounded grandchildren on abort/timeout (see
    // sandbox-local's local-machine.test.ts). SrtSandbox doesn't need that
    // extra mechanism: srt passes bwrap `--unshare-pid`, so the kernel tears
    // down every process in that PID namespace the moment its init process
    // dies — this test locks that guarantee in so a future srt/bwrap flag
    // change can't silently regress it.
    const sandbox = new SrtSandbox({ workdir });
    const handle = await sandbox.attach();
    const marker = `srt-orphan-test-${process.pid}-${Date.now()}`;

    const controller = new AbortController();
    const consume = (async () => {
      try {
        for await (const chunk of handle.exec(
          [
            "bash",
            "-c",
            `(exec -a ${marker} sleep 60) & echo started; sleep 60`,
          ],
          { signal: controller.signal },
        )) {
          void chunk;
        }
      } catch {
        // Expected: exec() rejects once aborted.
      }
    })();

    await new Promise((r) => setTimeout(r, 3000));
    controller.abort();
    await consume;
    await new Promise((r) => setTimeout(r, 3000));

    let survived = false;
    try {
      execSync(`pgrep -f -x "${marker} 60"`, { stdio: "ignore" });
      survived = true;
    } catch {
      survived = false; // pgrep exits non-zero when nothing matches
    }
    expect(survived).toBe(false);
  }, 120000);

  it("destroy() removes the generated srt-settings temp directory", async () => {
    // Regression: ensureSettingsFile() mkdtemp's a `srt-sandbox-*` dir under
    // the OS temp dir for the generated policy file, but nothing removed it
    // — every SrtSandbox instance that ran a command leaked one directory
    // for the life of the host. Confirmed for real: a debugging session
    // running this suite repeatedly had accumulated 80+ leaked directories
    // in /tmp before this fix.
    const before = new Set(
      (await fs.readdir(os.tmpdir())).filter((d) =>
        d.startsWith("srt-sandbox-"),
      ),
    );

    const sandbox = new SrtSandbox({ workdir });
    const handle = await sandbox.attach();
    const result = await run(handle, "echo hi");
    expect(result.ok).toBe(true);

    const afterRun = new Set(
      (await fs.readdir(os.tmpdir())).filter((d) =>
        d.startsWith("srt-sandbox-"),
      ),
    );
    const created = [...afterRun].filter((d) => !before.has(d));
    expect(created.length).toBeGreaterThan(0);

    await handle.destroy();

    const afterDestroy = new Set(
      (await fs.readdir(os.tmpdir())).filter((d) =>
        d.startsWith("srt-sandbox-"),
      ),
    );
    for (const dir of created) {
      expect(afterDestroy.has(dir)).toBe(false);
    }
  }, 120000);
});

describe("buildInstallHint", () => {
  it("suggests installing all dependencies named in srt's message", () => {
    const hint = buildInstallHint(
      "Sandbox dependencies not available: ripgrep (rg) not found, bubblewrap (bwrap) not installed, socat not installed",
    );
    expect(hint).toContain("apt-get install -y ripgrep bubblewrap socat");
    expect(hint).toContain("brew install ripgrep socat");
    expect(hint).toContain("userns");
  });

  it("only mentions what the message actually names as missing", () => {
    const hint = buildInstallHint(
      "Sandbox dependencies not available: socat not installed",
    );
    expect(hint).toContain("apt-get install -y socat");
    expect(hint).not.toContain("ripgrep");
    expect(hint).not.toContain("bubblewrap");
  });

  it("returns an empty string for a message naming no known dependency", () => {
    expect(buildInstallHint("some unrelated failure")).toBe("");
  });
});

/**
 * Preflight-check tests use a fake `srtCommand` (a tiny throwaway script)
 * instead of the real srt/bwrap wrapper, so they exercise attach()'s
 * fail-fast behavior deterministically on any platform/CI environment —
 * unlike the "real isolation" suite above, they don't need bubblewrap,
 * socat, or ripgrep actually installed.
 */
describe("SrtSandbox preflight check (fake wrapper)", () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await fs.mkdtemp(path.join(os.tmpdir(), "srt-preflight-wd-"));
  });

  afterEach(async () => {
    await fs.rm(workdir, { recursive: true, force: true }).catch(() => {});
  });

  async function writeFakeSrt(script: string): Promise<string[]> {
    const scriptPath = path.join(workdir, "fake-srt.cjs");
    await fs.writeFile(scriptPath, script);
    return [process.execPath, scriptPath];
  }

  it("attach() rejects immediately with an actionable message on a missing-dependency signature", async () => {
    const srtCommand = await writeFakeSrt(
      'console.error("Error: Sandbox dependencies not available: ripgrep (rg) not found, bubblewrap (bwrap) not installed, socat not installed"); process.exit(1);',
    );
    const sandbox = new SrtSandbox({ workdir, isolation: { srtCommand } });

    await expect(sandbox.attach()).rejects.toThrow(/ripgrep/);
  });

  it("does not mislabel an unrelated startup failure as a missing dependency", async () => {
    const srtCommand = await writeFakeSrt(
      'console.error("Error: something else entirely broke"); process.exit(1);',
    );
    const sandbox = new SrtSandbox({ workdir, isolation: { srtCommand } });

    await expect(sandbox.attach()).rejects.toThrow(
      /failed its startup preflight check/,
    );
    await expect(
      new SrtSandbox({ workdir, isolation: { srtCommand } }).attach(),
    ).rejects.not.toThrow(/apt-get install/);
  });

  it("attach() succeeds once the preflight probe passes", async () => {
    const srtCommand = await writeFakeSrt("process.exit(0);");
    const sandbox = new SrtSandbox({ workdir, isolation: { srtCommand } });

    const handle = await sandbox.attach();
    expect(handle).toBeDefined();
  });

  it("does not re-run the preflight probe on a second attach() (already attached)", async () => {
    const scriptPath = path.join(workdir, "counting-srt.cjs");
    const counterPath = path.join(workdir, "count.txt");
    await fs.writeFile(counterPath, "0");
    // Every invocation bumps a counter file — including the real payload
    // args exec()/runCommand() would pass — but this test only calls
    // attach() twice, so any increment beyond 1 means the probe re-ran.
    await fs.writeFile(
      scriptPath,
      [
        'const fs = require("fs");',
        `const p = ${JSON.stringify(counterPath)};`,
        "fs.writeFileSync(p, String(Number(fs.readFileSync(p, 'utf8')) + 1));",
        "process.exit(0);",
      ].join("\n"),
    );
    const sandbox = new SrtSandbox({
      workdir,
      isolation: { srtCommand: [process.execPath, scriptPath] },
    });

    await sandbox.attach();
    expect(Number(await fs.readFile(counterPath, "utf8"))).toBe(1);

    await sandbox.attach();
    expect(Number(await fs.readFile(counterPath, "utf8"))).toBe(1);
  });
});
