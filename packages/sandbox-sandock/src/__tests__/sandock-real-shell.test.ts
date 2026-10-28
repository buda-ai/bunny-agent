import { spawn } from "node:child_process";
import type { SandboxExecError as SandboxExecErrorType } from "@bunny-agent/manager";
import { describe, expect, it, vi } from "vitest";

/**
 * Real-execution integration tests for `SandockHandle.exec()`.
 *
 * Unlike `sandock-sandbox.test.ts` (string-assertion unit tests against a
 * fully mocked SDK), these tests mock only the network boundary
 * (`createSandockClient`) and wire its `sandbox.shell()` call to actually
 * run the generated command through Node's real `child_process` via
 * `/bin/sh -c`. This verifies the generated shell string has the POSIX
 * semantics the adapter assumes (safe quoting, exit code propagation,
 * stdout/stderr separation) rather than merely asserting substrings in the
 * built string.
 *
 * All fixtures are harmless (`echo`, `printf`, `exit N`, a bogus binary
 * name) — no destructive commands, no real Sandock network calls.
 */

interface ShellCallbacks {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onError?: (err: unknown) => void;
}

/** Runs `cmd` for real via `/bin/sh -c`, replaying output through the same callback shape Sandock's SDK uses. */
function realShellExec(
  cmd: string,
  callbacks: ShellCallbacks,
  options: { env?: Record<string, string>; workdir?: string } = {},
): Promise<{
  success: boolean;
  data: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationMs: number;
  };
}> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", cmd], {
      cwd: options.workdir,
      env: { ...process.env, ...options.env },
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      stdout += text;
      callbacks.onStdout?.(text);
    });
    child.stderr.on("data", (text: string) => {
      stderr += text;
      callbacks.onStderr?.(text);
    });
    child.on("error", (err) => {
      callbacks.onError?.(err);
      resolve({
        success: false,
        data: {
          exitCode: null,
          stdout,
          stderr,
          timedOut: false,
          durationMs: Date.now() - start,
        },
      });
    });
    child.on("close", (code) => {
      resolve({
        success: code === 0,
        data: {
          exitCode: code,
          stdout,
          stderr,
          timedOut: false,
          durationMs: Date.now() - start,
        },
      });
    });
  });
}

/**
 * Builds a SandockSandbox whose underlying client actually runs shell
 * commands via real child_process, and returns `SandboxExecError` re-resolved
 * through the same reset module graph as the dynamically imported adapter —
 * `vi.resetModules()` would otherwise give a statically imported
 * `SandboxExecError` a different class identity than the one the adapter
 * module actually throws, breaking `instanceof` checks.
 */
async function createRealShellSandbox() {
  vi.resetModules();
  vi.doMock("sandock", () => ({
    createSandockClient: vi.fn(() => ({
      sandbox: {
        create: vi
          .fn()
          .mockResolvedValue({ success: true, data: { id: "real-shell-1" } }),
        start: vi.fn().mockResolvedValue({
          success: true,
          data: { id: "real-shell-1", started: true },
        }),
        get: vi.fn().mockResolvedValue({
          success: true,
          data: { id: "real-shell-1", status: "RUNNING" },
        }),
        shell: vi.fn(
          (
            _sandboxId: string,
            params: {
              cmd: string;
              env?: Record<string, string>;
              workdir?: string;
            },
            callbacks: ShellCallbacks,
          ) => realShellExec(params.cmd, callbacks, params),
        ),
        stop: vi.fn().mockResolvedValue({
          success: true,
          data: { id: "real-shell-1", stopped: true },
        }),
        delete: vi.fn().mockResolvedValue({
          success: true,
          data: { id: "real-shell-1", deleted: true },
        }),
      },
      fs: {
        write: vi.fn().mockResolvedValue({ success: true, data: true }),
      },
      volume: {
        getByName: vi.fn().mockResolvedValue({
          success: true,
          data: { id: "volume-1", status: "ready" },
        }),
      },
    })),
  }));

  const { SandockSandbox } = await import("../sandock-sandbox.js");
  const { SandboxExecError } = await import("@bunny-agent/manager");
  process.env.SANDOCK_API_KEY = "test-api-key";
  // skipBootstrap avoids a real `npm install` attempt during attach() —
  // these tests only exercise exec(), not sandbox initialization.
  const sandbox = new SandockSandbox({ skipBootstrap: true, workdir: "/tmp" });
  const handle = await sandbox.attach();
  return { handle, SandboxExecError };
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

describe("SandockHandle.exec — real shell execution", () => {
  it("redacts split call secrets and bounds real stderr without log/cause exposure", async () => {
    const { handle } = await createRealShellSandbox();
    const secret = "sandock-private-secret";
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
  it("preserves legacy single-element shell syntax", async () => {
    const { handle } = await createRealShellSandbox();
    const result = await collectExec(handle, ["printf legacy; printf shell"]);
    expect(result).toEqual({ chunks: expect.any(Array), error: null });
    expect(result.chunks.join("")).toBe("legacyshell");
  });

  it("rejects invalid argv and env without launching", async () => {
    const { handle } = await createRealShellSandbox();
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
      "%s|%s|%s",
      "arg one",
      "arg two with  double space",
      "arg-three",
    ]);
    expect(error).toBeNull();
    expect(chunks.join("")).toBe(
      "arg one|arg two with  double space|arg-three",
    );
  });

  it("never executes command substitution embedded in a malicious env value", async () => {
    const { handle } = await createRealShellSandbox();
    const marker = `pwn-${process.pid}-${Date.now()}`;
    const maliciousValue = `\`touch /tmp/${marker}.txt\`; $(echo pwned); $HOME`;

    const { error } = await collectExec(
      handle,
      ["sh", "-c", "printf '%s' \"$MY_VAR\""],
      {
        env: { MY_VAR: maliciousValue },
      },
    );
    expect(error).toBeNull();

    // The real injection check: the backticked `touch` must never have run.
    const fileCheck = await collectExec(handle, [
      "sh",
      "-c",
      `test -f /tmp/${marker}.txt && echo EXISTS || echo MISSING`,
    ]);
    expect(fileCheck.chunks.join("")).toContain("MISSING");
  });

  it("exports a malicious env value and the command sees the literal value, not an executed one", async () => {
    const { handle } = await createRealShellSandbox();
    const value = "`id`; $(whoami); $HOME; !!";
    const { chunks, error } = await collectExec(
      handle,
      ["sh", "-c", "printf '%s' \"$MY_VAR\""],
      {
        env: { MY_VAR: value },
      },
    );
    expect(error).toBeNull();
    expect(chunks.join("")).toBe(value);
  });

  it("exports an env value containing newlines literally", async () => {
    const { handle } = await createRealShellSandbox();
    const value = "line1\nline2\nline3";
    const { chunks, error } = await collectExec(
      handle,
      ["sh", "-c", "printf '%s' \"$MY_VAR\""],
      {
        env: { MY_VAR: value },
      },
    );
    expect(error).toBeNull();
    expect(chunks.join("")).toBe(value);
  });

  it("exports an env value containing single quotes literally", async () => {
    const { handle } = await createRealShellSandbox();
    const value = "it's a 'quoted' value";
    const { chunks, error } = await collectExec(
      handle,
      ["sh", "-c", "printf '%s' \"$MY_VAR\""],
      {
        env: { MY_VAR: value },
      },
    );
    expect(error).toBeNull();
    expect(chunks.join("")).toBe(value);
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

  it("surfaces a shell syntax error (unclosed quote) as a thrown error, not a clean stream end", async () => {
    const { handle, SandboxExecError } = await createRealShellSandbox();
    // Single-element command array is passed through as a raw shell string
    // by the adapter (see baseCmd ternary) — this is the one path where a
    // caller-supplied string, not quoted argv, reaches the shell directly.
    const { error } = await collectExec(handle, ["echo 'unterminated"]);
    expect(error).toBeInstanceOf(SandboxExecError);
    const execError = error as SandboxExecErrorType;
    expect(execError.code).toBe("nonzero_exit");
    expect(execError.exitCode).toBe(2);
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

  it("respects cwd by actually changing directory before running the command", async () => {
    const { handle } = await createRealShellSandbox();
    const { chunks, error } = await collectExec(handle, ["pwd"], {
      cwd: "/tmp",
    });
    expect(error).toBeNull();
    expect(chunks.join("").trim()).toBe("/tmp");
  });

  it.each([
    "stdout",
    "stderr",
    "onError",
    "null",
    "undefined",
    "sync",
  ])("reports transport/status failure after %s", async (mode) => {
    vi.resetModules();
    vi.doMock("sandock", () => ({
      createSandockClient: vi.fn(() => ({
        sandbox: {
          create: vi
            .fn()
            .mockResolvedValue({ success: true, data: { id: "flaky-1" } }),
          start: vi.fn().mockResolvedValue({
            success: true,
            data: { id: "flaky-1", started: true },
          }),
          get: vi.fn().mockResolvedValue({
            success: true,
            data: { id: "flaky-1", status: "RUNNING" },
          }),
          shell: vi.fn(
            (
              _sandboxId: string,
              params: { cmd: string },
              callbacks: ShellCallbacks,
            ) => {
              // Let attach()'s own init commands (e.g. `mkdir -p`) succeed
              // normally; only the test's actual exec() command simulates
              // the drop, so we don't fail sandbox setup itself.
              if (!params.cmd.includes("echo")) {
                return Promise.resolve({
                  success: true,
                  data: {
                    exitCode: 0,
                    stdout: "",
                    stderr: "",
                    timedOut: false,
                    durationMs: 0,
                  },
                });
              }
              if (mode === "stdout") callbacks.onStdout?.("output before drop");
              if (mode === "stderr")
                callbacks.onStderr?.("diagnostic before drop");
              if (mode === "onError") {
                callbacks.onError?.(
                  new Error("connection dropped mid-request"),
                );
                return Promise.resolve({
                  success: true,
                  data: { exitCode: 0, timedOut: false },
                });
              }
              if (mode === "sync")
                throw new Error("connection dropped mid-request");
              if (mode === "null" || mode === "undefined")
                return Promise.resolve({
                  success: false,
                  data: {
                    exitCode: mode === "null" ? null : undefined,
                    timedOut: false,
                  },
                });
              return Promise.reject(
                new Error("connection dropped mid-request"),
              );
            },
          ),
          stop: vi.fn().mockResolvedValue({
            success: true,
            data: { id: "flaky-1", stopped: true },
          }),
          delete: vi.fn().mockResolvedValue({
            success: true,
            data: { id: "flaky-1", deleted: true },
          }),
        },
        fs: { write: vi.fn().mockResolvedValue({ success: true, data: true }) },
        volume: {
          getByName: vi.fn().mockResolvedValue({
            success: true,
            data: { id: "volume-1", status: "ready" },
          }),
        },
      })),
    }));

    const { SandockSandbox } = await import("../sandock-sandbox.js");
    process.env.SANDOCK_API_KEY = "test-api-key";
    const sandbox = new SandockSandbox({ skipBootstrap: true });
    const handle = await sandbox.attach();

    const { chunks, error } = await collectExec(handle, ["echo", "hi"]);
    expect(chunks.join("")).toBe(mode === "stdout" ? "output before drop" : "");
    expect(error).toMatchObject({ name: "SandboxExecError", retryable: false });
  });
});
