import { describe, expect, it } from "vitest";
import {
  buildCodingRunShellScript,
  buildDefaultDaemonCodingRunExecCommand,
  streamCodingRunFromSandbox,
} from "../coding-run.js";
import type { SandboxHandle } from "../types.js";

describe("coding-run", () => {
  it("builds curl POST with Content-Type and body file", () => {
    const args = buildDefaultDaemonCodingRunExecCommand({
      url: "http://127.0.0.1:3080/api/coding/run",
      reqPath: "/tmp/req.json",
    });
    expect(args[0]).toBe("curl");
    expect(args).toContain("--fail");
    expect(args).toContain("-N");
    expect(args).toContain("POST");
    expect(args).toContain("http://127.0.0.1:3080/api/coding/run");
    expect(args).toContain("Content-Type: application/json");
    expect(args).toContain("--data-binary");
    expect(args).toContain("@/tmp/req.json");
  });

  it("buildCodingRunShellScript registers trap and curl with quoted paths", () => {
    const script = buildCodingRunShellScript(
      "http://127.0.0.1:3080/",
      "/tmp/.bunny-agent-req.json",
    );
    expect(script).toContain("trap 'rm -f \"$REQ\"' EXIT INT TERM");
    expect(script).toContain("curl --fail -sS -N -X POST");
    expect(script).toContain("http://127.0.0.1:3080/api/coding/run");
    expect(script).toContain('--data-binary @"$REQ"');
    expect(script).toMatch(/^REQ='/);
  });

  it("prefers sandbox-native streamCodingRun when available", async () => {
    const streamed = [new TextEncoder().encode("data: ok\n\n")];
    let called = false;

    const handle: SandboxHandle = {
      getSandboxId: () => "sbx_1",
      getVolumes: () => null,
      getWorkdir: () => "/workspace",
      exec: async function* () {},
      upload: async () => {},
      readFile: async () => "",
      destroy: async () => {},
      streamCodingRun: async function* () {
        called = true;
        yield* streamed;
      },
    };

    const chunks: Uint8Array[] = [];
    for await (const chunk of streamCodingRunFromSandbox(
      handle,
      "http://127.0.0.1:3080",
      {
        runner: "claude",
        model: "claude-3-5-sonnet",
        userInput: "hello",
        cwd: "/workspace",
      },
    )) {
      chunks.push(chunk);
    }

    expect(called).toBe(true);
    expect(chunks).toEqual(streamed);
  });
});
