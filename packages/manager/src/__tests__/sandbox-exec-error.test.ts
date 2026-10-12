import { describe, expect, it } from "vitest";
import {
  ExecDiagnostics,
  SandboxExecError,
  validateExecInput,
} from "../sandbox-exec-error.js";

describe("SandboxExecError", () => {
  it("bounds a single huge multibyte callback and its truncation suffix", () => {
    const diagnostics = new ExecDiagnostics();
    diagnostics.append("界".repeat(100000));
    expect(Buffer.byteLength(diagnostics.text())).toBeLessThanOrEqual(4096);
    expect(diagnostics.text()).not.toContain("\ufffd");
    expect(diagnostics.text()).toContain("[truncated]");
  });

  it("redacts split and truncated secrets, messages, and omits unsafe causes", () => {
    const diagnostics = new ExecDiagnostics({ TOKEN: "secret-value" });
    diagnostics.append("secret-");
    diagnostics.append("value\n");
    expect(diagnostics.text()).toBe("[redacted]\n");
    const failure = diagnostics.failure(
      new Error("failed secret-value", { cause: new Error("secret-value") }),
    );
    expect(failure.message).toBe("failed [redacted]");
    expect(failure.cause).toBeUndefined();
    const truncated = new ExecDiagnostics({ TOKEN: "secret-value" });
    truncated.append("x".repeat(4090) + "secret-value");
    expect(truncated.text()).not.toContain("secret");
    expect(Buffer.byteLength(truncated.text())).toBeLessThanOrEqual(4096);
  });

  it("rejects empty executable and invalid env keys before execution", () => {
    for (const command of [[], [""], [" "]])
      expect(() => validateExecInput(command, {})).toThrow(SandboxExecError);
    expect(() => validateExecInput(["echo"], { "BAD;KEY": "value" })).toThrow(
      SandboxExecError,
    );
    expect(() =>
      validateExecInput(["echo", ""], { VALID_KEY: "value" }),
    ).not.toThrow();
  });
  it("is an instance of Error", () => {
    const err = new SandboxExecError("boom", { code: "nonzero_exit" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SandboxExecError");
    expect(err.message).toBe("boom");
  });

  it("is always retryable: false, regardless of code", () => {
    const codes = [
      "spawn_failed",
      "shell_parse_error",
      "nonzero_exit",
      "timeout",
      "aborted",
    ] as const;
    for (const code of codes) {
      const err = new SandboxExecError("x", { code });
      expect(err.retryable).toBe(false);
    }
  });

  it("defaults exitCode to null when omitted", () => {
    const err = new SandboxExecError("x", { code: "spawn_failed" });
    expect(err.exitCode).toBeNull();
  });

  it("carries the provided exitCode", () => {
    const err = new SandboxExecError("x", {
      code: "nonzero_exit",
      exitCode: 127,
    });
    expect(err.exitCode).toBe(127);
  });

  it("leaves stderr undefined when not provided", () => {
    const err = new SandboxExecError("x", { code: "nonzero_exit" });
    expect(err.stderr).toBeUndefined();
  });

  it("keeps short stderr untouched", () => {
    const err = new SandboxExecError("x", {
      code: "nonzero_exit",
      stderr: "short error output",
    });
    expect(err.stderr).toBe("short error output");
  });

  it("truncates stderr beyond the 4 KiB cap", () => {
    const huge = "x".repeat(5000);
    const err = new SandboxExecError("x", {
      code: "nonzero_exit",
      stderr: huge,
    });
    expect(err.stderr?.length).toBeLessThan(huge.length);
    expect(err.stderr).toContain("[truncated]");
  });

  it("sets cause when provided", () => {
    const cause = new Error("underlying transport failure");
    const err = new SandboxExecError("x", {
      code: "nonzero_exit",
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it("omits cause entirely when not provided (no cause: undefined noise)", () => {
    const err = new SandboxExecError("x", { code: "nonzero_exit" });
    expect("cause" in err).toBe(false);
  });

  it("survives JSON.stringify without throwing (diagnostics logging path)", () => {
    const err = new SandboxExecError("x", {
      code: "nonzero_exit",
      exitCode: 1,
      stderr: "boom",
    });
    expect(() =>
      JSON.stringify({ message: err.message, code: err.code }),
    ).not.toThrow();
  });
});
