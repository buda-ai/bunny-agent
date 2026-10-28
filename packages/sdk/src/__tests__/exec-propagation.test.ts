import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BunnyAgent,
  SandboxExecError,
  streamCodingRunFromSandbox,
} from "@bunny-agent/manager";
import { LocalMachine } from "@bunny-agent/sandbox-local";
import { streamText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";

async function fixture(partial = false, terminal = false) {
  const workdir = await mkdtemp(join(tmpdir(), "pul323-stream-"));
  const script = join(workdir, "runner.cjs");
  const launches = join(workdir, "launches");
  await writeFile(
    script,
    `
    require('node:fs').appendFileSync(${JSON.stringify(launches)}, 'launch\\n');
    ${partial ? `console.log(JSON.stringify({type:'text',text:'partial response'}));` : ""}
    ${terminal ? `console.log(JSON.stringify({type:'error',errorText:'runner terminal failure'})); console.log(JSON.stringify({type:'finish',finishReason:'error'}));` : ""}
    setTimeout(() => { process.stderr.write('abort initialization failed\\n'); process.exitCode = ${terminal ? 0 : 23}; }, 30);
  `,
  );
  const sandbox = new LocalMachine({
    workdir,
    runnerCommand: [process.execPath, script],
  });
  return { sandbox, launches, workdir };
}

describe("real subprocess propagation through manager and SDK", () => {
  it("reports a real process failure after protocol finish without duplicating finish", async () => {
    const { sandbox, workdir, launches } = await fixture();
    await writeFile(
      join(workdir, "runner.cjs"),
      `
      require('node:fs').appendFileSync(${JSON.stringify(launches)}, 'launch\\n');
      console.log(JSON.stringify({type:'finish',finishReason:'stop'}));
      setTimeout(() => { process.stderr.write('trailing failure\\n'); process.exitCode = 23; }, 30);
    `,
    );
    const result = streamText({
      model: createBunnyAgent({ sandbox })("test", { runnerType: "pi" }),
      prompt: "test",
      maxRetries: 2,
    });
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    expect(parts.filter((part) => part.type === "error")).toMatchObject([
      { error: { code: "nonzero_exit", exitCode: 23, retryable: false } },
    ]);
    expect(parts.filter((part) => part.type === "finish")).toHaveLength(1);
    expect(JSON.stringify(parts)).not.toContain("unexpected-stream-end");
    expect(await readFile(launches, "utf8")).toBe("launch\n");
  });
  it("synchronous exec validation stays in-band and is not retried even if cleanup fails", async () => {
    const { sandbox } = await fixture();
    const handle = await sandbox.attach();
    const exec = vi.spyOn(handle, "exec").mockImplementation(() => {
      throw new SandboxExecError("Invalid environment variable key", {
        code: "spawn_failed",
      });
    });
    vi.spyOn(handle, "destroy").mockRejectedValue(new Error("cleanup failed"));
    const result = streamText({
      model: createBunnyAgent({ sandbox })("test", { runnerType: "pi" }),
      prompt: "test",
      maxRetries: 2,
    });
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    expect(parts.filter((part) => part.type === "error")).toMatchObject([
      { error: { code: "spawn_failed", retryable: false } },
    ]);
    expect(
      parts.some(
        (part) => part.type === "finish" && part.finishReason === "error",
      ),
    ).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
  });
  it("SDK preserves ENOENT as an in-band nonretryable spawn error and launches once", async () => {
    const { workdir } = await fixture();
    const sandbox = new LocalMachine({
      workdir,
      runnerCommand: [join(workdir, "missing-executable")],
    });
    const handle = await sandbox.attach();
    const exec = vi.spyOn(handle, "exec");
    const result = streamText({
      model: createBunnyAgent({ sandbox })("test", { runnerType: "pi" }),
      prompt: "test",
      maxRetries: 2,
    });
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    expect(parts.filter((part) => part.type === "error")).toMatchObject([
      { error: { code: "spawn_failed", retryable: false } },
    ]);
    expect(
      parts.some(
        (part) => part.type === "finish" && part.finishReason === "error",
      ),
    ).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("explicit user abort closes without a synthetic unexpected-end error", async () => {
    const { sandbox } = await fixture();
    const controller = new AbortController();
    const model = createBunnyAgent({ sandbox })("test", { runnerType: "pi" });
    const result = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
      abortSignal: controller.signal,
    });
    controller.abort();
    const reader = result.stream.getReader();
    const parts = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    expect(parts.filter((part) => part.type === "error")).toEqual([]);
  });
  it.each([
    false,
    true,
  ])("manager preserves failure, partial=%s, one launch", async (partial) => {
    const { sandbox, launches } = await fixture(partial);
    const agent = new BunnyAgent({
      sandbox,
      runner: { model: "test", runnerType: "pi" },
    });
    const reader = (
      await agent.stream({ messages: [{ role: "user", content: "test" }] })
    ).getReader();
    let failure: unknown;
    let output = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += new TextDecoder().decode(value);
      }
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      name: "SandboxExecError",
      exitCode: 23,
      retryable: false,
    });
    expect((failure as Error).message).toContain("abort initialization failed");
    expect(output.includes("partial response")).toBe(partial);
    expect(await readFile(launches, "utf8")).toBe("launch\n");
  });

  it.each([
    false,
    true,
  ])("SDK emits execution error and terminal finish, partial=%s, no retry", async (partial) => {
    const { sandbox, launches } = await fixture(partial);
    const provider = createBunnyAgent({
      sandbox,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    const result = streamText({
      model: provider("test", { runnerType: "pi" }),
      prompt: "test",
      maxRetries: 2,
    });
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    const errors = parts.filter((part) => part.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      error: { code: "nonzero_exit", exitCode: 23, retryable: false },
    });
    expect(
      parts.some(
        (part) => part.type === "finish" && part.finishReason === "error",
      ),
    ).toBe(true);
    expect(JSON.stringify(parts)).not.toContain("unexpected-stream-end");
    expect(
      parts.some(
        (part) =>
          part.type === "text-delta" && part.text === "partial response",
      ),
    ).toBe(partial);
    expect(await readFile(launches, "utf8")).toBe("launch\n");
  });

  it("runner terminal error plus finish does not produce a second EOF error", async () => {
    const { sandbox, launches } = await fixture(true, true);
    const result = streamText({
      model: createBunnyAgent({ sandbox })("test", { runnerType: "pi" }),
      prompt: "test",
    });
    const parts = [];
    for await (const part of result.fullStream) parts.push(part);
    expect(parts.filter((part) => part.type === "error")).toHaveLength(1);
    expect(
      parts.some(
        (part) => part.type === "finish" && part.finishReason === "error",
      ),
    ).toBe(true);
    expect(await readFile(launches, "utf8")).toBe("launch\n");
  });

  it("daemon fallback preserves real curl failure even when best-effort cleanup fails", async () => {
    const { sandbox } = await fixture();
    const local = await sandbox.attach();
    const primary = vi.fn(
      (command: string[], opts?: Parameters<typeof local.exec>[1]) =>
        local.exec(command, opts),
    );
    const handle = {
      getWorkdir: () => local.getWorkdir(),
      getSandboxId: () => null,
      getVolumes: () => null,
      upload: local.upload.bind(local),
      readFile: local.readFile.bind(local),
      destroy: local.destroy.bind(local),
      exec: (command: string[], opts?: Parameters<typeof local.exec>[1]) =>
        command[0] === "/bin/rm"
          ? {
              [Symbol.asyncIterator]: () => ({
                next: async (): Promise<IteratorResult<Uint8Array>> => {
                  throw new Error("cleanup failed");
                },
              }),
            }
          : primary(command, opts),
    };
    let failure: unknown;
    try {
      for await (const _ of streamCodingRunFromSandbox(
        handle,
        "http://127.0.0.1:1",
        { runner: "pi", model: "test" },
      )) {
      }
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: "nonzero_exit",
      exitCode: 7,
      retryable: false,
    });
    expect(primary).toHaveBeenCalledTimes(1);
  });
});
