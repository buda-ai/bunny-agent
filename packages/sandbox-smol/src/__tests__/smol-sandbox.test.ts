import { beforeEach, describe, expect, it, vi } from "vitest";
import { SmolSandbox } from "../smol-sandbox.js";

const fake = vi.hoisted(() => {
  const machine = {
    id: "mach-test",
    exec: vi.fn(async (argv: string[]) => ({
      exitCode: argv[0] === "test" ? 0 : 0,
      stdout: "",
      stderr: "",
    })),
    execStream: vi.fn(async function* (): AsyncGenerator<{
      kind: string;
      data?: string;
      exitCode?: number;
    }> {
      yield { kind: "stdout", data: "hello" } as const;
      yield { kind: "exit", exitCode: 0 } as const;
    }),
    readFile: vi.fn(async () => Buffer.from("result")),
    writeFile: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    state: vi.fn(async () => "running"),
    resume: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    waitUntilReady: vi.fn(async () => {}),
  };
  return {
    machine,
    create: vi.fn(async () => machine),
    connect: vi.fn(async () => machine),
    list: vi.fn(async () => [] as Array<{ id: string; state: string }>),
  };
});

vi.mock("smolmachines", () => ({
  Machine: { create: fake.create, connect: fake.connect, list: fake.list },
}));

beforeEach(() => {
  vi.clearAllMocks();
  fake.machine.exec.mockImplementation(async (argv: string[]) => ({
    exitCode: argv[0] === "test" ? 0 : 0,
    stdout: "",
    stderr: "",
  }));
  fake.machine.execStream.mockImplementation(async function* () {
    yield { kind: "stdout", data: "hello" } as const;
    yield { kind: "exit", exitCode: 0 } as const;
  });
  fake.list.mockResolvedValue([]);
  fake.machine.state.mockResolvedValue("running");
});

describe("SmolSandbox", () => {
  it("streams command output, propagates options and destroys unnamed VMs", async () => {
    const sandbox = new SmolSandbox({ env: { API_KEY: "secret" } });
    const handle = await sandbox.attach();
    const output: string[] = [];
    for await (const chunk of handle.exec(["node", "-v"], {
      cwd: "/workspace/project",
      env: { API_KEY: "override" },
      timeout: 1250,
    }))
      output.push(Buffer.from(chunk).toString());
    expect(output).toEqual(["hello"]);
    expect(sandbox.getRunnerCommand()).toEqual([
      "/workspace/node_modules/.bin/bunny-agent-runner",
      "run",
    ]);
    expect(fake.machine.execStream).toHaveBeenCalledWith(
      ["node", "-v"],
      expect.objectContaining({
        workdir: "/workspace/project",
        timeout: 2,
        env: expect.objectContaining({
          API_KEY: "override",
          NODE_PATH: "/workspace/node_modules",
        }),
      }),
    );
    await handle.destroy();
    await handle.destroy();
    expect(fake.machine.delete).toHaveBeenCalledTimes(1);
    expect(sandbox.getHandle()).toBeNull();
  });

  it("rejects upload traversal and keeps binary bytes intact", async () => {
    const sandbox = new SmolSandbox();
    const handle = await sandbox.attach();
    await expect(
      handle.upload([{ path: "../secret", content: "bad" }], "/workspace"),
    ).rejects.toThrow("Invalid sandbox upload path");
    await expect(
      handle.upload([{ path: "/tmp/escape", content: "bad" }], "/workspace"),
    ).rejects.toThrow();
    const bytes = Uint8Array.from([0, 1, 255]);
    await handle.upload(
      [{ path: "files/payload.bin", content: bytes }],
      "/workspace",
    );
    expect(fake.machine.writeFile).toHaveBeenCalledWith(
      "/workspace/files/payload.bin",
      bytes,
    );
    expect(await handle.readFile("/workspace/result.txt")).toBe("result");
  });

  it("reconnects a named cloud VM, waits for readiness and stops without deletion", async () => {
    fake.list.mockResolvedValue([{ id: "mach-existing", state: "stopped" }]);
    const sandbox = new SmolSandbox({ target: "cloud", name: "agent-1" });
    const handle = await sandbox.attach();
    expect(fake.list).toHaveBeenCalledWith(
      { target: "cloud" },
      {
        labels: {
          "bunny-agent-adapter": "smol",
          "bunny-agent-name": expect.stringMatching(/^bunny-[a-f0-9]{24}$/),
        },
      },
    );
    expect(fake.connect).toHaveBeenCalledWith("mach-existing", {
      target: "cloud",
    });
    expect(fake.machine.start).toHaveBeenCalledOnce();
    expect(fake.machine.waitUntilReady).toHaveBeenCalledOnce();
    await handle.destroy();
    expect(fake.machine.stop).toHaveBeenCalledOnce();
    expect(fake.machine.delete).not.toHaveBeenCalled();
  });

  it("resumes a paused cloud VM without discarding its memory", async () => {
    fake.list.mockResolvedValue([{ id: "mach-paused", state: "paused" }]);
    const handle = await new SmolSandbox({
      target: "cloud",
      name: "agent-1",
    }).attach();
    expect(fake.machine.resume).toHaveBeenCalledOnce();
    expect(fake.machine.start).not.toHaveBeenCalled();
    fake.machine.state.mockResolvedValue("stopped");
    await handle.destroy();
    expect(fake.machine.stop).not.toHaveBeenCalled();
  });

  it("deletes a new VM if runner installation fails", async () => {
    fake.machine.exec.mockImplementation(async (argv: string[]) => ({
      exitCode: argv[0] === "test" || argv[0] === "npm" ? 1 : 0,
      stdout: "",
      stderr: "install failed",
    }));
    await expect(new SmolSandbox().attach()).rejects.toThrow(
      "Could not install Bunny Agent runner",
    );
    expect(fake.machine.delete).toHaveBeenCalledOnce();
  });

  it("shares one creation when two calls attach concurrently", async () => {
    const sandbox = new SmolSandbox();
    const [first, second] = await Promise.all([
      sandbox.attach(),
      sandbox.attach(),
    ]);
    expect(first).toBe(second);
    expect(fake.create).toHaveBeenCalledOnce();
  });

  it("requires the installed runner binary before returning a handle", async () => {
    fake.machine.exec.mockImplementation(async (argv: string[]) => ({
      exitCode: argv[0] === "test" ? 1 : 0,
      stdout: "",
      stderr: "",
    }));
    await expect(new SmolSandbox().attach()).rejects.toThrow(
      "binary is missing",
    );
    expect(fake.machine.delete).toHaveBeenCalledOnce();
  });

  it("reports a streamed nonzero exit with stderr", async () => {
    fake.machine.execStream.mockImplementation(async function* () {
      yield { kind: "stderr", data: "failed" } as const;
      yield { kind: "exit", exitCode: 17 } as const;
    });
    const handle = await new SmolSandbox().attach();
    const drain = async () => {
      for await (const _chunk of handle.exec(["false"])) {
        /* consume */
      }
    };
    await expect(drain()).rejects.toThrow("code 17: failed");
  });
});
