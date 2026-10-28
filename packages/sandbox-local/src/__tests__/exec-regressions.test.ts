import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalMachine } from "../local-machine.js";

async function handle() {
  return new LocalMachine({
    workdir: await mkdtemp(join(tmpdir(), "pul323-")),
  }).attach();
}

describe("local exec regressions", () => {
  it.each([
    0, 7,
  ])("settles after a slow reader resumes following child close, exit=%s", async (exitCode) => {
    const sandbox = await handle();
    const iterator = sandbox
      .exec([
        process.execPath,
        "-e",
        `process.stdout.write('partial'); process.exitCode=${exitCode}`,
      ])
      [Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (exitCode === 0)
      await expect(iterator.next()).resolves.toMatchObject({ done: true });
    else
      await expect(iterator.next()).rejects.toMatchObject({
        code: "nonzero_exit",
        exitCode,
      });
  }, 2000);

  it("classifies ENOENT and EACCES without retaining raw causes", async () => {
    const sandbox = await handle();
    const file = join(sandbox.getWorkdir(), "not-executable");
    await writeFile(file, "#!/bin/sh\nexit 0\n");
    await chmod(file, 0o600);
    for (const command of [[join(sandbox.getWorkdir(), "missing")], [file]]) {
      await expect(collect(sandbox.exec(command))).rejects.toMatchObject({
        code: "spawn_failed",
      });
    }
  });

  it("preserves signal termination as failure with unknown exit code", async () => {
    const sandbox = await handle();
    await expect(
      collect(
        sandbox.exec([
          process.execPath,
          "-e",
          "process.kill(process.pid, 'SIGTERM')",
        ]),
      ),
    ).rejects.toMatchObject({ exitCode: null, signal: "SIGTERM" });
  });

  it("redacts split secrets and bounds multibyte diagnostics without yielding stderr", async () => {
    const sandbox = await handle();
    const secret = "private-split-secret";
    try {
      await collect(
        sandbox.exec(
          [
            process.execPath,
            "-e",
            "process.stderr.write(process.env.SECRET.slice(0,8)); setTimeout(()=>{process.stderr.write(process.env.SECRET.slice(8)+'界'.repeat(9000));process.exitCode=9},20)",
          ],
          { env: { SECRET: secret } },
        ),
      );
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "nonzero_exit" });
      expect((error as Error).cause).toBeUndefined();
      const failure = error as Error & { stderr: string };
      expect(failure.message + failure.stderr).not.toContain(secret);
      expect(failure.stderr).toContain("[redacted]");
      expect(Buffer.byteLength(failure.stderr)).toBeLessThanOrEqual(4096);
      expect(failure.stderr).not.toContain("\ufffd");
    }
  });
});

async function collect(iterable: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}
