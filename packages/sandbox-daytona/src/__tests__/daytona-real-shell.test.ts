import { spawn } from "node:child_process";
import type { SandboxExecError as SandboxExecErrorType } from "@bunny-agent/manager";
import { describe, expect, it, vi } from "vitest";

/**
 * Real-execution integration tests for `DaytonaHandle.exec()`.
 *
 * Mocks only the `@daytonaio/sdk` boundary and wires
 * `sandbox.process.executeSessionCommand`/`getSessionCommandLogs`/
 * `getSessionCommand` to actually run the generated shell command string
 * through Node's real `child_process` via `/bin/sh -c`, so the adapter's
 * quoting/escaping and exit-code retrieval (via the separate
 * `getSessionCommand` call, since `getSessionCommandLogs` itself resolves
 * to `void`) are exercised against real POSIX shell semantics instead of
 * string assertions against the built command.
 *
 * All fixtures are harmless (`echo`, `printf`, `exit N`, a bogus binary
 * name) — no destructive commands, no real Daytona network calls.
 */

interface SessionProcessMock {
  createSession: ReturnType<typeof vi.fn>;
  executeSessionCommand: ReturnType<typeof vi.fn>;
  getSessionCommandLogs: ReturnType<typeof vi.fn>;
  getSessionCommand: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
}

/** Runs `cmd` for real via `/bin/sh -c`, replaying output through the same callback shape the Daytona SDK uses, and records the real exit code for a later `getSessionCommand` lookup. */
function createRealSessionProcess(): SessionProcessMock {
  const exitCodeByCmdId = new Map<string, number | null>();
  let nextCmdId = 0;

  return {
    createSession: vi.fn().mockResolvedValue(undefined),
    executeSessionCommand: vi.fn(
      (_sessionId: string, req: { command: string; runAsync?: boolean }) => {
        if (!req.runAsync) {
          // Used by attach()'s own init commands (mkdir, chmod, etc.) in
          // the synchronous form — resolve immediately, exit 0.
          return Promise.resolve({
            exitCode: 0,
            stdout: "",
            stderr: "",
            output: "",
          });
        }
        const cmdId = `cmd-${nextCmdId++}`;
        return Promise.resolve({ cmdId, command: req.command });
      },
    ),
    getSessionCommandLogs: vi.fn(
      (
        _sessionId: string,
        cmdId: string,
        onStdout: (chunk: string) => void,
        onStderr: (chunk: string) => void,
      ) => {
        return new Promise<void>((resolve, reject) => {
          // cmdId encodes which executeSessionCommand call this belongs to;
          // the actual command string isn't passed here by the real SDK
          // either — it's resolved from the stored session command, so we
          // look it up the same way: via a side-channel map populated by
          // executeSessionCommand's mock closure (set below via `commandByCmdId`).
          const cmd = commandByCmdId.get(cmdId);
          if (cmd === undefined) {
            reject(new Error(`Unknown cmdId: ${cmdId}`));
            return;
          }
          const child = spawn("/bin/sh", ["-c", cmd]);
          child.stdout.setEncoding("utf8");
          child.stderr.setEncoding("utf8");
          child.stdout.on("data", onStdout);
          child.stderr.on("data", onStderr);
          child.on("error", (err) => reject(err));
          child.on("close", (code) => {
            exitCodeByCmdId.set(cmdId, code);
            resolve();
          });
        });
      },
    ),
    getSessionCommand: vi.fn((_sessionId: string, cmdId: string) => {
      return Promise.resolve({
        id: cmdId,
        exitCode: exitCodeByCmdId.get(cmdId),
      });
    }),
    deleteSession: vi.fn().mockResolvedValue(undefined),
  };
}

// executeSessionCommand only returns `{ cmdId, command }` — getSessionCommandLogs
// needs the original command string to actually run it, so this side-channel
// map mirrors what the real Daytona backend does internally (store the
// command keyed by cmdId), without baking that into the mock's closures above.
const commandByCmdId = new Map<string, string>();

/**
 * Builds a DaytonaSandbox whose underlying client actually runs shell
 * commands via real child_process, returning `SandboxExecError` re-resolved
 * through the same reset module graph as the dynamically imported adapter
 * so `instanceof` checks compare the same class identity.
 */
async function createRealShellSandbox(workdir?: string) {
  vi.resetModules();
  commandByCmdId.clear();
  const sessionProcess = createRealSessionProcess();
  const originalExecuteSessionCommand = sessionProcess.executeSessionCommand;
  sessionProcess.executeSessionCommand = vi.fn(
    async (sessionId: string, req: { command: string; runAsync?: boolean }) => {
      const result = await originalExecuteSessionCommand(sessionId, req);
      if (req.runAsync && result.cmdId) {
        commandByCmdId.set(result.cmdId, req.command);
      }
      return result;
    },
  );

  const mockSandbox = {
    id: "real-daytona-1",
    state: "started",
    start: vi.fn().mockResolvedValue(undefined),
    refreshActivity: vi.fn().mockResolvedValue(undefined),
    waitUntilStarted: vi.fn().mockResolvedValue(undefined),
    recover: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    process: sessionProcess,
  };

  vi.doMock("@daytonaio/sdk", () => ({
    Daytona: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockResolvedValue(mockSandbox),
      create: vi.fn().mockResolvedValue(mockSandbox),
      volume: {
        get: vi.fn().mockResolvedValue({ id: "volume-1", state: "ready" }),
      },
    })),
  }));

  const { DaytonaSandbox } = await import("../daytona-sandbox.js");
  const { SandboxExecError } = await import("@bunny-agent/manager");
  process.env.DAYTONA_API_KEY = "test-api-key";
  // `name` + an already-"started" mock sandbox makes attach() skip
  // initializeSandbox() entirely (see attach()'s `needsInit` branch) —
  // these tests only exercise exec(), not sandbox initialization/npm
  // install. Skipping init also makes it safe to pass a malicious
  // `workdir`: NODE_PATH/PATH are derived from `this.workdir`
  // (`PATH: \`${this.workdir}/node_modules/.bin:...\``), and `opts?.env` is
  // spread *before* those hardcoded keys in exec(), so a caller-supplied
  // env value is always overwritten — workdir is the only value that
  // actually flows unescaped into the shell string's env-export line.
  // initializeSandbox() itself also interpolates `this.workdir` unescaped
  // into other shell commands (e.g. the template-copy step), which would
  // be a second, pre-existing injection site if init ran — out of scope
  // here since workdir is trusted deployment config, not request-time
  // input funneled through exec()'s command/env/argv.
  const sandbox = new DaytonaSandbox({
    name: "existing-for-test",
    ...(workdir !== undefined ? { workdir } : {}),
  });
  const attached = await sandbox.attach();
  const handle = {
    ...attached,
    exec: (command: string[], opts?: Parameters<typeof attached.exec>[1]) =>
      attached.exec(command, { cwd: "/tmp", ...opts }),
  };
  return { handle, SandboxExecError, sessionProcess };
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

describe("DaytonaHandle.exec — real shell execution", () => {
  it("redacts split call secrets and bounds real stderr without log/cause exposure", async () => {
    const { handle } = await createRealShellSandbox();
    const secret = "daytona-private-secret";
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
  it("passes all call env and cwd to the real child", async () => {
    const { handle } = await createRealShellSandbox();
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
  });

  it.each([null, undefined])("rejects unknown status %s", async (exitCode) => {
    const { handle, sessionProcess } = await createRealShellSandbox();
    sessionProcess.getSessionCommand.mockResolvedValueOnce({ exitCode });
    expect((await collectExec(handle, ["echo", "test"])).error).toMatchObject({
      code: "nonzero_exit",
      exitCode: null,
    });
  });

  it("rejects empty argv and invalid env before launch", async () => {
    const { handle, sessionProcess } = await createRealShellSandbox();
    const calls = sessionProcess.executeSessionCommand.mock.calls.length;
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
    expect(sessionProcess.executeSessionCommand).toHaveBeenCalledTimes(calls);
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

  it("never executes command substitution embedded in a malicious workdir value", async () => {
    const marker = `pwn-daytona-${process.pid}-${Date.now()}`;
    const maliciousValue = `\`touch /tmp/${marker}.txt\`; $(echo pwned)`;

    // NODE_PATH/PATH are the only env keys the adapter's envExports line
    // exports (see exec()'s `.filter(([key]) => key === "NODE_PATH" || key === "PATH")`),
    // and both are derived from `this.workdir` rather than read from
    // caller-supplied `opts.env` — the adapter spreads `...opts?.env`
    // *before* its own hardcoded NODE_PATH/PATH keys, so a caller-supplied
    // value is always overwritten and never reaches the export line.
    // `workdir` is the only caller-reachable value that actually flows
    // unescaped into that line, so we smuggle the payload through it.
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
