import { describe, it, expect, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execAsync = promisify(spawn);

/**
 * Real integration tests for runner-cli with actual process execution.
 *
 * These tests verify that the runner-cli can actually execute commands
 * using real processes (process.cmd), not just mocked implementations.
 */
describe("runner-cli Real Process Execution", () => {
  const testWorkDir = join(tmpdir(), "sandagent-runner-test");

  beforeAll(async () => {
    // Create test workspace directory
    await mkdir(testWorkDir, { recursive: true });
  });

  it("should execute sandagent CLI and get help output", async () => {
    const cliPath = join(process.cwd(), "dist", "bundle.mjs");

    return new Promise<void>((resolve, reject) => {
      const proc = spawn("node", [cliPath, "--help"], {
        cwd: testWorkDir,
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
        try {
          // Should display help without errors
          expect(stdout).toContain("sandagent");
          expect(code).toBe(0);
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      proc.on("error", reject);

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error("Process timed out"));
      }, 5000);
    });
  });

  it("should execute runner-claude with local sandbox", async () => {
    // Skip this test if dependencies are not available
    try {
      await import("@sandagent/runner-claude");
      await import("@sandagent/sandbox-local");
    } catch {
      console.log("Skipping: dependencies not available");
      return;
    }

    // Create a simple test script that uses runner-claude
    const testScript = `
import { runAgent } from '@sandagent/runner-claude';
import { LocalSandbox } from '@sandagent/sandbox-local';

const sandbox = new LocalSandbox();

try {
  const result = await runAgent({
    model: 'claude-sonnet-4-20250514',
    messages: [{ role: 'user', content: 'echo "Test message"' }],
    sandbox,
  });
  
  console.log('SUCCESS:', JSON.stringify({ completed: true }));
} catch (error) {
  console.error('ERROR:', error.message);
  process.exit(1);
}
`;

    const scriptPath = join(testWorkDir, "test-runner.mjs");
    await writeFile(scriptPath, testScript);

    return new Promise<void>((resolve, reject) => {
      const proc = spawn("node", [scriptPath], {
        cwd: testWorkDir,
        stdio: "pipe",
        env: {
          ...process.env,
          NODE_PATH: join(process.cwd(), "node_modules"),
        },
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
        try {
          if (code !== 0) {
            console.log("STDOUT:", stdout);
            console.log("STDERR:", stderr);
          }
          
          // Check for success indicator
          expect(stdout).toContain("SUCCESS");
          expect(code).toBe(0);
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      proc.on("error", reject);

      // Timeout after 30 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error("Process timed out after 30s"));
      }, 30000);
    });
  });

  it("should handle process errors gracefully", async () => {
    return new Promise<void>((resolve, reject) => {
      // Try to execute a command that doesn't exist
      const proc = spawn("nonexistent-command-xyz", [], {
        cwd: testWorkDir,
        stdio: "pipe",
      });

      proc.on("error", (error) => {
        // Should get ENOENT error
        expect(error.message).toContain("ENOENT");
        resolve();
      });

      proc.on("close", () => {
        reject(new Error("Should have errored"));
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error("Process timed out"));
      }, 5000);
    });
  });

  it("should execute shell command with spawn", async () => {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn("echo", ["Hello from spawn"], {
        cwd: testWorkDir,
        stdio: "pipe",
      });

      let stdout = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.on("close", (code) => {
        try {
          expect(code).toBe(0);
          expect(stdout.trim()).toBe("Hello from spawn");
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      proc.on("error", reject);

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error("Process timed out"));
      }, 5000);
    });
  });

  it("should pass environment variables to spawned process", async () => {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn("sh", ["-c", "echo $TEST_VAR"], {
        cwd: testWorkDir,
        stdio: "pipe",
        env: {
          ...process.env,
          TEST_VAR: "test_value_123",
        },
      });

      let stdout = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.on("close", (code) => {
        try {
          expect(code).toBe(0);
          expect(stdout.trim()).toBe("test_value_123");
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      proc.on("error", reject);

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error("Process timed out"));
      }, 5000);
    });
  });

  it("should handle stderr output", async () => {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn("sh", ["-c", "echo 'error message' >&2"], {
        cwd: testWorkDir,
        stdio: "pipe",
      });

      let stderr = "";

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        try {
          expect(code).toBe(0);
          expect(stderr.trim()).toBe("error message");
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      proc.on("error", reject);

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error("Process timed out"));
      }, 5000);
    });
  });

  it("should handle non-zero exit codes", async () => {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn("sh", ["-c", "exit 42"], {
        cwd: testWorkDir,
        stdio: "pipe",
      });

      proc.on("close", (code) => {
        try {
          expect(code).toBe(42);
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      proc.on("error", reject);

      // Timeout after 5 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error("Process timed out"));
      }, 5000);
    });
  });
});
