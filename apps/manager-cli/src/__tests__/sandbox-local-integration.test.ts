import { SandAgent } from "@sandagent/manager";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for SandAgent with LocalSandbox
 *
 * These tests verify the actual integration between SandAgent and LocalSandbox,
 * ensuring that commands execute correctly in the local environment.
 */
describe("SandAgent + LocalSandbox Integration", () => {
  let LocalSandbox:
    | typeof import("@sandagent/sandbox-local").LocalSandbox
    | undefined;

  beforeAll(async () => {
    try {
      // Import sandbox-local package at runtime (optional dependency)
      const module = await import("@sandagent/sandbox-local");
      LocalSandbox = module.LocalSandbox;
      console.log("Successfully loaded @sandagent/sandbox-local");
    } catch (error) {
      console.warn("@sandagent/sandbox-local not available:", error);
    }
  });

  describe("Real Command Execution Tests", () => {
    it("should execute echo command and return output", async () => {
      if (!LocalSandbox) {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      const sandbox = new LocalSandbox();
      const agent = new SandAgent({
        sandboxId: "test-echo",
        sandbox,
        runner: {
          kind: "claude-agent-sdk",
          model: "claude-sonnet-4-20250514",
        },
      });

      const handle = await sandbox.attach("test-echo");
      const result = await handle.runCommand("echo 'Hello from LocalSandbox'");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Hello from LocalSandbox");
    });

    it("should execute ls command in workspace", async () => {
      if (!LocalSandbox) {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      const sandbox = new LocalSandbox();
      const handle = await sandbox.attach("test-ls");

      // Create a test file
      await handle.upload(
        [{ path: "test.txt", content: "test content" }],
        "/tmp/sandagent-test",
      );

      // List files
      const result = await handle.runCommand("ls /tmp/sandagent-test");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("test.txt");
    });

    it("should handle process execution with node", async () => {
      if (!LocalSandbox) {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      const sandbox = new LocalSandbox();
      const handle = await sandbox.attach("test-node");

      // Create a simple Node.js script
      await handle.upload(
        [
          {
            path: "test.js",
            content:
              "console.log('Hello from Node.js'); console.log(process.version);",
          },
        ],
        "/tmp/sandagent-test",
      );

      // Execute the script
      const result = await handle.runCommand(
        "node /tmp/sandagent-test/test.js",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Hello from Node.js");
      expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/); // Node version pattern
    });

    it("should handle command with error exit code", async () => {
      if (!LocalSandbox) {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      const sandbox = new LocalSandbox();
      const handle = await sandbox.attach("test-error");

      const result = await handle.runCommand("exit 42");

      expect(result.exitCode).toBe(42);
    });

    it("should handle multi-line commands", async () => {
      if (!LocalSandbox) {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      const sandbox = new LocalSandbox();
      const handle = await sandbox.attach("test-multiline");

      const result = await handle.runCommand(
        "echo 'Line 1' && echo 'Line 2' && echo 'Line 3'",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Line 1");
      expect(result.stdout).toContain("Line 2");
      expect(result.stdout).toContain("Line 3");
    });

    it("should handle file operations", async () => {
      if (!LocalSandbox) {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      const sandbox = new LocalSandbox();
      const handle = await sandbox.attach("test-fileops");

      // Create directory and files
      await handle.runCommand(
        "mkdir -p /tmp/sandagent-fileops && echo 'content1' > /tmp/sandagent-fileops/file1.txt && echo 'content2' > /tmp/sandagent-fileops/file2.txt",
      );

      // Verify files exist
      const result = await handle.runCommand(
        "cat /tmp/sandagent-fileops/file1.txt && cat /tmp/sandagent-fileops/file2.txt",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("content1");
      expect(result.stdout).toContain("content2");
    });

    it("should execute Python script", async () => {
      if (!LocalSandbox) {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      const sandbox = new LocalSandbox();
      const handle = await sandbox.attach("test-python");

      // Create Python script
      await handle.upload(
        [
          {
            path: "test.py",
            content:
              "print('Hello from Python')\nfor i in range(3): print(f'Count: {i}')",
          },
        ],
        "/tmp/sandagent-test",
      );

      // Execute Python script
      const result = await handle.runCommand(
        "python3 /tmp/sandagent-test/test.py",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Hello from Python");
      expect(result.stdout).toContain("Count: 0");
      expect(result.stdout).toContain("Count: 1");
      expect(result.stdout).toContain("Count: 2");
    });

    it("should handle environment variables", async () => {
      if (!LocalSandbox) {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      const sandbox = new LocalSandbox({
        env: {
          TEST_VAR: "test_value",
          CUSTOM_VAR: "custom_value",
        },
      });
      const handle = await sandbox.attach("test-env");

      const result = await handle.runCommand(
        "echo $TEST_VAR && echo $CUSTOM_VAR",
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("test_value");
      expect(result.stdout).toContain("custom_value");
    });
  });
});
