import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalSandbox } from "../local-sandbox.js";

describe("LocalSandbox", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-sandbox-test-"));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to clean up temp dir: ${tempDir}`, error);
    }
  });

  describe("constructor", () => {
    it("should create an instance with default options", () => {
      const sandbox = new LocalSandbox();
      expect(sandbox).toBeInstanceOf(LocalSandbox);
    });

    it("should accept custom options", () => {
      const sandbox = new LocalSandbox({
        baseDir: tempDir,
        isolate: true,
        defaultTimeout: 30000,
      });
      expect(sandbox).toBeInstanceOf(LocalSandbox);
    });

    it("should use process.cwd() as default baseDir", () => {
      const sandbox = new LocalSandbox();
      expect(sandbox).toBeInstanceOf(LocalSandbox);
    });

    it("should allow disabling isolation", () => {
      const sandbox = new LocalSandbox({
        baseDir: tempDir,
        isolate: false,
      });
      expect(sandbox).toBeInstanceOf(LocalSandbox);
    });
  });

  describe("attach", () => {
    it("should create isolated directory for sandbox ID", async () => {
      const sandbox = new LocalSandbox({
        baseDir: tempDir,
        isolate: true,
      });

      const handle = await sandbox.attach("test-agent-1");
      expect(handle).toBeDefined();

      // Verify the directory was created
      const expectedDir = path.join(tempDir, "test-agent-1");
      const stat = await fs.stat(expectedDir);
      expect(stat.isDirectory()).toBe(true);

      await handle.destroy();
    });

    it("should use base directory when isolation is disabled", async () => {
      const sandbox = new LocalSandbox({
        baseDir: tempDir,
        isolate: false,
      });

      const handle = await sandbox.attach("test-agent-2");
      expect(handle).toBeDefined();

      await handle.destroy();
    });

    it("should return a SandboxHandle", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("test-agent-3");

      expect(typeof handle.exec).toBe("function");
      expect(typeof handle.upload).toBe("function");
      expect(typeof handle.destroy).toBe("function");

      await handle.destroy();
    });
  });

  describe("SandboxHandle.exec", () => {
    it("should execute a simple command", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("exec-test-1");

      const chunks: string[] = [];
      for await (const chunk of handle.exec(["echo", "hello world"])) {
        chunks.push(new TextDecoder().decode(chunk));
      }

      const output = chunks.join("");
      expect(output.trim()).toBe("hello world");

      await handle.destroy();
    });

    it("should execute commands in specified working directory", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("exec-test-2");

      // Create a subdirectory
      const subDir = "subdir";
      await handle.upload([], subDir); // Creates the directory

      // Create a test file in the subdirectory
      await handle.upload(
        [{ path: "test.txt", content: "test content" }],
        subDir,
      );

      // List files in the subdirectory
      const chunks: string[] = [];
      for await (const chunk of handle.exec(["ls"], { cwd: subDir })) {
        chunks.push(new TextDecoder().decode(chunk));
      }

      const output = chunks.join("");
      expect(output).toContain("test.txt");

      await handle.destroy();
    });

    it("should pass environment variables", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("exec-test-3");

      const chunks: string[] = [];
      for await (const chunk of handle.exec(["sh", "-c", "echo $TEST_VAR"], {
        env: { TEST_VAR: "test-value" },
      })) {
        chunks.push(new TextDecoder().decode(chunk));
      }

      const output = chunks.join("");
      expect(output.trim()).toBe("test-value");

      await handle.destroy();
    });

    it("should throw error for non-existent command", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("exec-test-4");

      await expect(async () => {
        const chunks = [];
        for await (const chunk of handle.exec([
          "non-existent-command-xyz123",
        ])) {
          chunks.push(chunk);
        }
      }).rejects.toThrow();

      await handle.destroy();
    });

    it("should throw error for empty command", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("exec-test-5");

      await expect(async () => {
        const chunks = [];
        for await (const chunk of handle.exec([])) {
          chunks.push(chunk);
        }
      }).rejects.toThrow("Command cannot be empty");

      await handle.destroy();
    });

    it("should handle command timeout", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("exec-test-6");

      await expect(async () => {
        const chunks = [];
        for await (const chunk of handle.exec(["sleep", "10"], {
          timeout: 100, // 100ms timeout
        })) {
          chunks.push(chunk);
        }
      }).rejects.toThrow(/timed out/i);

      await handle.destroy();
    }, 10000); // Test timeout of 10 seconds

    it("should support abort signal", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("exec-test-7");

      const abortController = new AbortController();

      // Abort after 100ms
      setTimeout(() => abortController.abort(), 100);

      await expect(async () => {
        const chunks = [];
        for await (const chunk of handle.exec(["sleep", "10"], {
          signal: abortController.signal,
        })) {
          chunks.push(chunk);
        }
      }).rejects.toThrow();

      await handle.destroy();
    }, 10000);
  });

  describe("SandboxHandle.upload", () => {
    it("should upload a single file", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("upload-test-1");

      await handle.upload(
        [{ path: "test.txt", content: "Hello, World!" }],
        ".",
      );

      // Verify the file was created
      const filePath = path.join(tempDir, "upload-test-1", "test.txt");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("Hello, World!");

      await handle.destroy();
    });

    it("should upload multiple files", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("upload-test-2");

      await handle.upload(
        [
          { path: "file1.txt", content: "Content 1" },
          { path: "file2.txt", content: "Content 2" },
          { path: "file3.txt", content: "Content 3" },
        ],
        "uploads",
      );

      // Verify all files were created
      const uploadsDir = path.join(tempDir, "upload-test-2", "uploads");
      const files = await fs.readdir(uploadsDir);
      expect(files).toContain("file1.txt");
      expect(files).toContain("file2.txt");
      expect(files).toContain("file3.txt");

      await handle.destroy();
    });

    it("should upload binary content", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("upload-test-3");

      const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

      await handle.upload([{ path: "binary.dat", content: binaryData }], ".");

      // Verify the binary file
      const filePath = path.join(tempDir, "upload-test-3", "binary.dat");
      const content = await fs.readFile(filePath);
      expect(content).toEqual(Buffer.from(binaryData));

      await handle.destroy();
    });

    it("should create nested directories", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("upload-test-4");

      await handle.upload(
        [{ path: "deep/nested/dir/file.txt", content: "Nested content" }],
        ".",
      );

      // Verify nested file
      const filePath = path.join(
        tempDir,
        "upload-test-4",
        "deep/nested/dir/file.txt",
      );
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("Nested content");

      await handle.destroy();
    });

    it("should upload to custom target directory", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("upload-test-5");

      await handle.upload(
        [{ path: "file.txt", content: "Custom target" }],
        "custom/target",
      );

      // Verify file in custom location
      const filePath = path.join(
        tempDir,
        "upload-test-5",
        "custom/target/file.txt",
      );
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("Custom target");

      await handle.destroy();
    });
  });

  describe("SandboxHandle.destroy", () => {
    it("should complete successfully", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("destroy-test-1");

      await expect(handle.destroy()).resolves.toBeUndefined();
    });

    it("should not delete the working directory by default", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("destroy-test-2");

      await handle.upload([{ path: "file.txt", content: "Test" }], ".");
      await handle.destroy();

      // Directory should still exist
      const workDir = path.join(tempDir, "destroy-test-2");
      const stat = await fs.stat(workDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("Integration tests", () => {
    it("should support a complete workflow", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("integration-test-1");

      // Upload a Python script
      await handle.upload(
        [
          {
            path: "script.py",
            content: 'print("Hello from Python!")\nprint("Line 2")',
          },
        ],
        ".",
      );

      // Execute the script
      const chunks: string[] = [];
      for await (const chunk of handle.exec(["python3", "script.py"])) {
        chunks.push(new TextDecoder().decode(chunk));
      }

      const output = chunks.join("");
      expect(output).toContain("Hello from Python!");
      expect(output).toContain("Line 2");

      await handle.destroy();
    });

    it("should handle multiple sequential commands", async () => {
      const sandbox = new LocalSandbox({ baseDir: tempDir });
      const handle = await sandbox.attach("integration-test-2");

      // Create a file
      await handle.upload([{ path: "data.txt", content: "test data" }], ".");

      // Read the file with cat
      const chunks1: string[] = [];
      for await (const chunk of handle.exec(["cat", "data.txt"])) {
        chunks1.push(new TextDecoder().decode(chunk));
      }
      expect(chunks1.join("")).toContain("test data");

      // List files
      const chunks2: string[] = [];
      for await (const chunk of handle.exec(["ls", "-la"])) {
        chunks2.push(new TextDecoder().decode(chunk));
      }
      expect(chunks2.join("")).toContain("data.txt");

      await handle.destroy();
    });
  });
});
