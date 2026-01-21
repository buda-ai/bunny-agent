/**
 * Integration tests for runner-cli
 * Tests actual process execution
 */

import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";

// Get CLI path - works in both compiled and source context
const CLI_PATH = join(process.cwd(), "dist/bundle.mjs");

describe("runner-cli Integration Tests", () => {
  const TIMEOUT = 10000;

  it("should display help message", async () => {
    const output = await runCLI(["--help"]);
    
    expect(output.stdout).toContain("SandAgent Runner CLI");
    expect(output.stdout).toContain("--runner");
    expect(output.stdout).toContain("--model");
    expect(output.exitCode).toBe(0);
  }, TIMEOUT);

  it("should show error when no user input provided", async () => {
    const output = await runCLI(["run"]);
    
    expect(output.stderr).toContain("User input is required");
    expect(output.exitCode).toBe(1);
  }, TIMEOUT);

  it("should show error for invalid runner", async () => {
    const output = await runCLI(["run", "--runner", "invalid", "--", "test task"]);
    
    expect(output.stderr).toContain("must be one of");
    expect(output.exitCode).toBe(1);
  }, TIMEOUT);

  it("should accept claude runner option", async () => {
    // This will fail without API key, but should parse arguments correctly
    const output = await runCLI(["run", "--runner", "claude", "--", "echo hello"], {
      env: { ...process.env, ANTHROPIC_API_KEY: "" }
    });
    
    // Should fail due to missing API key, not argument parsing
    expect(output.stderr).toContain("ANTHROPIC_API_KEY");
  }, TIMEOUT);
});

/**
 * Helper to run CLI and capture output
 */
function runCLI(
  args: string[],
  options: { env?: Record<string, string> } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [CLI_PATH, ...args], {
      env: options.env || process.env,
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    proc.on("error", reject);

    // Timeout
    setTimeout(() => {
      proc.kill();
      reject(new Error("Process timed out"));
    }, 15000);
  });
}
