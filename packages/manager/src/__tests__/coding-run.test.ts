import { describe, expect, it } from "vitest";
import {
  buildCodingRunShellScript,
  buildDefaultDaemonCodingRunExecCommand,
} from "../coding-run.js";

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
});
