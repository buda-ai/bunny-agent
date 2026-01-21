/**
 * Integration test for LocalSandbox adapter
 * 
 * This test verifies the LocalSandbox implementation works correctly
 * with the SandboxAdapter interface defined in core.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SandboxAdapter, SandboxHandle } from "../types.js";

describe("LocalSandbox Integration", () => {
  let tempDir: string;
  let LocalSandbox: any;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "core-local-sandbox-test-"),
    );

    // Dynamically import LocalSandbox
    try {
      const module = await import("@sandagent/sandbox-local");
      LocalSandbox = module.LocalSandbox;
    } catch (error) {
      console.warn(
        "Could not import @sandagent/sandbox-local, skipping test",
        error,
      );
    }
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to clean up temp dir: ${tempDir}`, error);
    }
  });

  it("should create a LocalSandbox instance", async () => {
    if (!LocalSandbox) {
      console.log("LocalSandbox not available, skipping test");
      return;
    }

    const sandbox = new LocalSandbox({
      baseDir: tempDir,
      isolate: true,
    });

    expect(sandbox).toBeDefined();
    expect(typeof sandbox.attach).toBe("function");
  });

  it("should implement SandboxAdapter interface", async () => {
    if (!LocalSandbox) {
      console.log("LocalSandbox not available, skipping test");
      return;
    }

    const sandbox: SandboxAdapter = new LocalSandbox({
      baseDir: tempDir,
      isolate: true,
    });

    const handle = await sandbox.attach("test-core-1");

    expect(handle).toBeDefined();
    expect(typeof handle.exec).toBe("function");
    expect(typeof handle.upload).toBe("function");
    expect(typeof handle.destroy).toBe("function");

    await handle.destroy();
  });

  it("should attach to a sandbox and execute commands", async () => {
    if (!LocalSandbox) {
      console.log("LocalSandbox not available, skipping test");
      return;
    }

    const sandbox: SandboxAdapter = new LocalSandbox({
      baseDir: tempDir,
      isolate: true,
    });

    const handle = await sandbox.attach("test-core-2");

    // Test command execution
    const chunks: string[] = [];
    for await (const chunk of handle.exec(["echo", "Hello from core"])) {
      chunks.push(new TextDecoder().decode(chunk));
    }

    const output = chunks.join("");
    expect(output.trim()).toBe("Hello from core");

    await handle.destroy();
  });

  it("should upload and execute a simple script", async () => {
    if (!LocalSandbox) {
      console.log("LocalSandbox not available, skipping test");
      return;
    }

    const sandbox: SandboxAdapter = new LocalSandbox({
      baseDir: tempDir,
      isolate: true,
    });

    const handle = await sandbox.attach("test-core-3");

    // Upload a simple shell script
    await handle.upload(
      [
        {
          path: "test.sh",
          content: '#!/bin/bash\necho "Script executed successfully"',
        },
      ],
      ".",
    );

    // Make it executable and run it
    const chunks1: string[] = [];
    for await (const chunk of handle.exec(["chmod", "+x", "test.sh"])) {
      chunks1.push(new TextDecoder().decode(chunk));
    }

    const chunks2: string[] = [];
    for await (const chunk of handle.exec(["bash", "test.sh"])) {
      chunks2.push(new TextDecoder().decode(chunk));
    }

    const output = chunks2.join("");
    expect(output.trim()).toBe("Script executed successfully");

    await handle.destroy();
  });

  it("should work with Python scripts", async () => {
    if (!LocalSandbox) {
      console.log("LocalSandbox not available, skipping test");
      return;
    }

    const sandbox: SandboxAdapter = new LocalSandbox({
      baseDir: tempDir,
      isolate: true,
    });

    const handle = await sandbox.attach("test-core-4");

    // Upload a Python script
    await handle.upload(
      [
        {
          path: "hello.py",
          content: 'print("Hello from Python!")\nprint("Working directory:", __file__)',
        },
      ],
      ".",
    );

    // Execute the Python script
    const chunks: string[] = [];
    for await (const chunk of handle.exec(["python3", "hello.py"])) {
      chunks.push(new TextDecoder().decode(chunk));
    }

    const output = chunks.join("");
    expect(output).toContain("Hello from Python!");

    await handle.destroy();
  });

  it("should support environment variables", async () => {
    if (!LocalSandbox) {
      console.log("LocalSandbox not available, skipping test");
      return;
    }

    const sandbox: SandboxAdapter = new LocalSandbox({
      baseDir: tempDir,
      isolate: true,
    });

    const handle = await sandbox.attach("test-core-5");

    // Execute a command with custom environment variables
    const chunks: string[] = [];
    for await (const chunk of handle.exec(
      ["sh", "-c", "echo $MY_VAR; echo $ANOTHER_VAR"],
      {
        env: {
          MY_VAR: "test-value",
          ANOTHER_VAR: "another-value",
        },
      },
    )) {
      chunks.push(new TextDecoder().decode(chunk));
    }

    const output = chunks.join("");
    expect(output).toContain("test-value");
    expect(output).toContain("another-value");

    await handle.destroy();
  });

  it("should handle multiple sandboxes in parallel", async () => {
    if (!LocalSandbox) {
      console.log("LocalSandbox not available, skipping test");
      return;
    }

    const sandbox: SandboxAdapter = new LocalSandbox({
      baseDir: tempDir,
      isolate: true,
    });

    // Create multiple sandbox instances
    const handle1 = await sandbox.attach("parallel-1");
    const handle2 = await sandbox.attach("parallel-2");
    const handle3 = await sandbox.attach("parallel-3");

    // Execute commands in parallel
    const results = await Promise.all([
      (async () => {
        const chunks: string[] = [];
        for await (const chunk of handle1.exec(["echo", "sandbox-1"])) {
          chunks.push(new TextDecoder().decode(chunk));
        }
        return chunks.join("").trim();
      })(),
      (async () => {
        const chunks: string[] = [];
        for await (const chunk of handle2.exec(["echo", "sandbox-2"])) {
          chunks.push(new TextDecoder().decode(chunk));
        }
        return chunks.join("").trim();
      })(),
      (async () => {
        const chunks: string[] = [];
        for await (const chunk of handle3.exec(["echo", "sandbox-3"])) {
          chunks.push(new TextDecoder().decode(chunk));
        }
        return chunks.join("").trim();
      })(),
    ]);

    expect(results).toEqual(["sandbox-1", "sandbox-2", "sandbox-3"]);

    // Clean up
    await Promise.all([handle1.destroy(), handle2.destroy(), handle3.destroy()]);
  });

  it("should persist files across commands in same sandbox", async () => {
    if (!LocalSandbox) {
      console.log("LocalSandbox not available, skipping test");
      return;
    }

    const sandbox: SandboxAdapter = new LocalSandbox({
      baseDir: tempDir,
      isolate: true,
    });

    const handle = await sandbox.attach("test-core-6");

    // Create a file
    const chunks1: string[] = [];
    for await (const chunk of handle.exec([
      "sh",
      "-c",
      "echo 'persistent data' > data.txt",
    ])) {
      chunks1.push(new TextDecoder().decode(chunk));
    }

    // Read the file in a separate command
    const chunks2: string[] = [];
    for await (const chunk of handle.exec(["cat", "data.txt"])) {
      chunks2.push(new TextDecoder().decode(chunk));
    }

    const output = chunks2.join("");
    expect(output.trim()).toBe("persistent data");

    await handle.destroy();
  });
});
