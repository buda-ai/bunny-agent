import { describe, expect, it } from "vitest";
import { buildDefaultDaemonCodingRunExecCommand } from "../coding-run.js";

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
});
