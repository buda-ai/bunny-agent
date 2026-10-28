import { spawn } from "node:child_process";
import type { SandboxExecError as SandboxExecErrorType } from "@bunny-agent/manager";
import { describe, expect, it, vi } from "vitest";

/**
 * Real-execution integration tests for `E2BHandle.exec()`.
 *
 * Mocks only the `e2b` SDK boundary and wires `instance.commands.run()` to
 * actually execute the generated shell command string through Node's real
 * `child_process` via `/bin/sh -c`, so the adapter's quoting/escaping and
 * exit-code handling are exercised against real POSIX shell semantics
 * instead of string assertions against the built command.
 *
 * All fixtures are harmless (`echo`, `printf`, `exit N`, a bogus binary
 * name) — no destructive commands, no real E2B network calls.
 */

interface RunOpts {
  cwd?: string;
  envs?: Record<string, string>;
  timeoutMs?: number;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

class FakeCommandExitError extends Error {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  constructor(result: { exitCode: number; stdout: string; stderr: string }) {
    super(`Command exited with code ${result.exitCode}`);
    this.name = "CommandExitError";
    this.exitCode = result.exitCode;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
  }
}

/** Runs `cmd` for real via `/bin/sh -c`, mirroring E2B's commands.run contract: resolves on exit 0, rejects with a CommandExitError-shaped error otherwise. */
function realCommandsRun(
  cmd: string,
  opts: RunOpts,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", ["-c", cmd], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.envs },
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      stdout += text;
      opts.onStdout?.(text);
    });
    child.stderr.on("data", (text: string) => {
      stderr += text;
      opts.onStderr?.(text);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === null) {
        reject(new Error("Unknown process status"));
        return;
      }
      const exitCode = code;
      const result = { exitCode, stdout, stderr };
      if (exitCode !== 0) {
        reject(new FakeCommandExitError(result));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Builds an E2BSandbox whose underlying client actually runs shell commands
 * via real child_process, returning `SandboxExecError` re-resolved through
 * the same reset module graph as the dynamically imported adapter so
 * `instanceof` checks compare the same class identity.
 */
async function createRealShellSandbox(workdir?: string) {
  vi.resetModules();
  const instance = {
    sandboxId: "real-e2b-1",
    files: {
      makeDir: vi.fn().mockResolvedValue(undefined),
    },
    commands: {
      run: vi.fn((cmd: string, opts: RunOpts = {}) =>
        realCommandsRun(cmd, opts),
      ),
    },
  };
  vi.doMock("e2b", () => ({
    CommandExitError: FakeCommandExitError,
    Sandbox: {
      create: vi.fn().mockResolvedValue(instance),
      // `name` + an existing sandbox makes attach() skip initializeSandbox()
      // entirely (see attach()'s `needsInit` branch) — used by the
      // malicious-`workdir` tests below, since initializeSandbox() itself
      // interpolates `this.workdir` unescaped into shell commands (e.g.
      // `chmod 777 ${this.workdir}`), which is a separate, pre-existing
      // injection site outside exec()'s env-export line and out of scope
      // for this fix (`workdir` is trusted deployment config, not
      // request-time input funneled through exec()'s command/env/argv).
      list: vi.fn(() => ({
        nextItems: vi
          .fn()
          .mockResolvedValue([{ sandboxId: "real-e2b-1", state: "running" }]),
      })),
      connect: vi.fn().mockResolvedValue(instance),
    },
  }));

  const { E2BSandbox } = await import("../e2b-sandbox.js");
  const { SandboxExecError } = await import("@bunny-agent/manager");
  const sandbox = new E2BSandbox({
    apiKey: "test-api-key",
    // Custom-template prefix skips npm install during initializeSandbox()
    // (see isCustomTemplate()) — these tests only exercise exec(), not init.
    template: "bunny-agent-base",
    ...(workdir !== undefined ? { workdir, name: "existing-for-test" } : {}),
  });
  const attached = await sandbox.attach();
  const handle = {
    ...attached,
    exec: (command: string[], opts?: Parameters<typeof attached.exec>[1]) =>
      attached.exec(command, { cwd: "/tmp", ...opts }),
  };
  return { handle, SandboxExecError, instance };
}

type Handle = Awaited<ReturnType<typeof createRealShellSandbox>>["handle"];

async function collectExec(
  handle: Handle,
  command: string[],
  opts?: Parameters<Handle["exec"]>[1],
): Promise<{ chunks: string[]; error: unknown }> {
  const chunks: string[] = [];
  try {
    for await (const chunk of handle.exec(command, opts)) {
      chunks.push(new TextDecoder().decode(chunk));
    }
    return { chunks, error: null };
  } catch (error) {
    return { chunks, error };
  }
}

describe("E2BHandle.exec — real shell execution", () => {
  it("redacts split call secrets and bounds real stderr without log/cause exposure", async () => {
    const { handle } = await createRealShellSandbox();
    const secret = "e2b-private-secret";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await collectExec(
        handle,
        [
          process.execPath,
          "-e",
          "process.stderr.write(process.env.SECRET.slice(0,8)); setTimeout(()=>{process.stderr.write(process.env.SECRET.slice(8)+'界'.repeat(9000));process.exitCode=9},20)",
        ],
        { env: { SECRET: secret } },
      );
      const failure = result.error as SandboxExecErrorType;
      expect(failure.stderr).toContain("[redacted]");
      expect(Buffer.byteLength(failure.stderr!)).toBeLessThanOrEqual(4096);
      expect(failure.cause).toBeUndefined();
      expect(result.chunks).toEqual([]);
      expect(
        [
          failure.message,
          failure.stderr,
          ...log.mock.calls.flat(),
          ...errorLog.mock.calls.flat(),
        ].join(" "),
      ).not.toContain(secret);
    } finally {
      log.mockRestore();
      errorLog.mockRestore();
    }
  });
  it("passes native env and cwd to the real child without shell exports", async () => {
    const { handle, instance } = await createRealShellSandbox();
    const value = "literal '$HOME' $(id)\nvalue";
    const result = await collectExec(
      handle,
      ["sh", "-c", 'printf \'%s|%s|\' "$CUSTOM" "$NODE_PATH"; pwd'],
      {
        env: { CUSTOM: value, NODE_PATH: value, PATH: "/usr/bin:/bin" },
        cwd: "/tmp",
      },
    );
    expect(result.error).toBeNull();
    expect(result.chunks.join("")).toBe(`${value}|${value}|/tmp\n`);
    const [command, options] = instance.commands.run.mock.calls.at(-1)!;
    expect(command).not.toContain("export ");
    expect(options).toMatchObject({ envs: { CUSTOM: value }, cwd: "/tmp" });
  });

  it.each([
    null,
    undefined,
    4,
  ])("rejects resolved nonzero/unknown status %s", async (exitCode) => {
    const { handle, instance } = await createRealShellSandbox();
    instance.commands.run.mockImplementationOnce(async () => ({
      exitCode: exitCode as number,
      stdout: "",
      stderr: "",
    }));
    expect((await collectExec(handle, ["echo", "test"])).error).toMatchObject({
      code: "nonzero_exit",
      retryable: false,
    });
  });

  it("rejects empty argv and invalid env before launch", async () => {
    const { handle, instance } = await createRealShellSandbox();
    const calls = instance.commands.run.mock.calls.length;
    for (const command of [[], [""]])
      expect((await collectExec(handle, command)).error).toMatchObject({
        code: "spawn_failed",
      });
    expect(
      (
        await collectExec(handle, ["echo", "test"], {
          env: { "BAD;KEY": "test" },
        })
      ).error,
    ).toMatchObject({ code: "spawn_failed" });
    expect(instance.commands.run).toHaveBeenCalledTimes(calls);
  });
  it("delivers stdout from a normal command", async () => {
    const { handle } = await createRealShellSandbox();
    const { chunks, error } = await collectExec(handle, [
      "echo",
      "hello world",
    ]);
    expect(error).toBeNull();
    expect(chunks.join("")).toContain("hello world");
  });

  it("passes argv containing spaces through unmodified", async () => {
    const { handle } = await createRealShellSandbox();
    const { chunks, error } = await collectExec(handle, [
      "printf",
      "%s|%s",
      "arg one",
      "arg two with  double space",
    ]);
    expect(error).toBeNull();
    expect(chunks.join("")).toBe("arg one|arg two with  double space");
  });

  it("never executes command substitution embedded in a malicious env value", async () => {
    const marker = `pwn-e2b-${process.pid}-${Date.now()}`;
    const maliciousValue = `\`touch /tmp/${marker}.txt\`; $(echo pwned)`;

    // NODE_PATH/PATH are the only env keys the adapter's envExports line
    // exports (see exec()'s `.filter(([key]) => key === "NODE_PATH" || key === "PATH")`),
    // and both are derived from `this.workdir`
    // (`PATH: \`${this.workdir}/node_modules/.bin:...\``) rather than read
    // from caller-supplied `opts.env` — the adapter spreads `...opts?.env`
    // *before* its own hardcoded NODE_PATH/PATH keys, so a caller-supplied
    // PATH value is always overwritten and never reaches the export line.
    // `workdir` is therefore the only caller-reachable value that actually
    // flows unescaped into that line, so we smuggle the payload through it.
    const { handle } = await createRealShellSandbox(
      `/workspace-${maliciousValue}`,
    );
    const { chunks, error } = await collectExec(handle, [
      "sh",
      "-c",
      `test -f /tmp/${marker}.txt && echo EXISTS || echo MISSING`,
    ]);
    expect(error).toBeNull();
    expect(chunks.join("")).toContain("MISSING");
  });

  it("exports a malicious PATH value derived from workdir and the command sees the literal value, not an executed one", async () => {
    const maliciousSuffix = "`id`; $(whoami); $HOME";
    const { handle } = await createRealShellSandbox(
      `/workspace-${maliciousSuffix}`,
    );
    const { chunks, error } = await collectExec(handle, [
      "sh",
      "-c",
      "printf '%s' \"$PATH\"",
    ]);
    expect(error).toBeNull();
    expect(chunks.join("")).toBe(
      `/workspace-${maliciousSuffix}/node_modules/.bin:/usr/local/bin:/usr/bin:/bin`,
    );
  });

  it("never yields stderr content into the stdout protocol stream", async () => {
    const { handle } = await createRealShellSandbox();
    const { chunks, error } = await collectExec(handle, [
      "sh",
      "-c",
      "echo ON_STDOUT; echo ON_STDERR 1>&2",
    ]);
    expect(error).toBeNull();
    const combined = chunks.join("");
    expect(combined).toContain("ON_STDOUT");
    expect(combined).not.toContain("ON_STDERR");
  });

  it("never yields stderr even when the command exits nonzero", async () => {
    const { handle, SandboxExecError } = await createRealShellSandbox();
    const { chunks, error } = await collectExec(handle, [
      "sh",
      "-c",
      "echo ON_STDOUT; echo ON_STDERR 1>&2; exit 1",
    ]);
    expect(error).toBeInstanceOf(SandboxExecError);
    const combined = chunks.join("");
    expect(combined).toContain("ON_STDOUT");
    expect(combined).not.toContain("ON_STDERR");
  });

  it("throws SandboxExecError with the real exit code and captured stderr on nonzero exit", async () => {
    const { handle, SandboxExecError } = await createRealShellSandbox();
    const { error } = await collectExec(handle, [
      "sh",
      "-c",
      "echo failure detail 1>&2; exit 42",
    ]);
    expect(error).toBeInstanceOf(SandboxExecError);
    const execError = error as SandboxExecErrorType;
    expect(execError.code).toBe("nonzero_exit");
    expect(execError.exitCode).toBe(42);
    expect(execError.stderr).toContain("failure detail");
    expect(execError.retryable).toBe(false);
  });

  it("surfaces a missing executable as a nonzero exit (shell reports 127), not a silent success", async () => {
    const { handle, SandboxExecError } = await createRealShellSandbox();
    const { chunks, error } = await collectExec(handle, [
      "this-binary-does-not-exist-anywhere",
    ]);
    expect(chunks.join("")).toBe("");
    expect(error).toBeInstanceOf(SandboxExecError);
    const execError = error as SandboxExecErrorType;
    expect(execError.code).toBe("nonzero_exit");
    expect(execError.exitCode).toBe(127);
  });

  it("delivers already-yielded stdout chunks before throwing on a later nonzero exit", async () => {
    const { handle, SandboxExecError } = await createRealShellSandbox();
    const { chunks, error } = await collectExec(handle, [
      "sh",
      "-c",
      "echo partial-output-before-failure; exit 7",
    ]);
    expect(chunks.join("")).toContain("partial-output-before-failure");
    expect(error).toBeInstanceOf(SandboxExecError);
    expect((error as SandboxExecErrorType).exitCode).toBe(7);
  });

  it("finishes cleanly on exit 0 with no error", async () => {
    const { handle } = await createRealShellSandbox();
    const { chunks, error } = await collectExec(handle, [
      "sh",
      "-c",
      "echo ok; exit 0",
    ]);
    expect(error).toBeNull();
    expect(chunks.join("")).toContain("ok");
  });
});
