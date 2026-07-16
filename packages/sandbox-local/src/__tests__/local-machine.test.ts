import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalMachine, LocalSandbox } from "../local-machine.js";

/** True if a process whose argv0 is exactly `marker` is currently running
 *  (used to detect orphaned grandchildren after abort/timeout). POSIX only —
 *  `pgrep` isn't available on Windows, and process-group kill is POSIX-only
 *  in local-machine.ts's killProcessTree() too. */
function isProcessRunning(marker: string): boolean {
  try {
    execSync(`pgrep -f -x "${marker} 60"`, { stdio: "ignore" });
    return true;
  } catch {
    return false; // pgrep exits non-zero when nothing matches
  }
}

describe("LocalMachine", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-machine-test-"));
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
      const sandbox = new LocalMachine();
      expect(sandbox).toBeInstanceOf(LocalMachine);
    });

    it("should accept custom options", () => {
      const sandbox = new LocalMachine({
        workdir: tempDir,
        defaultTimeout: 30000,
      });
      expect(sandbox).toBeInstanceOf(LocalMachine);
    });

    it("should use process.cwd() as default workdir", () => {
      const sandbox = new LocalMachine();
      expect(sandbox).toBeInstanceOf(LocalMachine);
    });
  });

  describe("attach", () => {
    it("should use workdir as working directory", async () => {
      const sandbox = new LocalMachine({
        workdir: tempDir,
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
      expect(handle.getWorkdir()).toBe(tempDir);

      await handle.destroy();
    });

    it("should return a SandboxHandle", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      expect(typeof handle.exec).toBe("function");
      expect(typeof handle.upload).toBe("function");
      expect(typeof handle.destroy).toBe("function");

      await handle.destroy();
    });
  });

  describe("SandboxHandle.exec", () => {
    it("should execute a simple command", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      const chunks: string[] = [];
      for await (const chunk of handle.exec(["echo", "hello world"])) {
        chunks.push(new TextDecoder().decode(chunk));
      }

      const output = chunks.join("");
      expect(output.trim()).toBe("hello world");

      await handle.destroy();
    });

    it("should execute commands in specified working directory", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

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
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

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
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

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
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      await expect(async () => {
        const chunks = [];
        for await (const chunk of handle.exec([])) {
          chunks.push(chunk);
        }
      }).rejects.toThrow("Command cannot be empty");

      await handle.destroy();
    });

    it("should handle command timeout", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

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
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

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
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      await handle.upload(
        [{ path: "test.txt", content: "Hello, World!" }],
        ".",
      );

      // Verify the file was created
      const filePath = path.join(tempDir, "test.txt");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("Hello, World!");

      await handle.destroy();
    });

    it("should upload multiple files", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      await handle.upload(
        [
          { path: "file1.txt", content: "Content 1" },
          { path: "file2.txt", content: "Content 2" },
          { path: "file3.txt", content: "Content 3" },
        ],
        "uploads",
      );

      // Verify all files were created
      const uploadsDir = path.join(tempDir, "uploads");
      const files = await fs.readdir(uploadsDir);
      expect(files).toContain("file1.txt");
      expect(files).toContain("file2.txt");
      expect(files).toContain("file3.txt");

      await handle.destroy();
    });

    it("should upload binary content", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"

      await handle.upload([{ path: "binary.dat", content: binaryData }], ".");

      // Verify the binary file
      const filePath = path.join(tempDir, "binary.dat");
      const content = await fs.readFile(filePath);
      expect(content).toEqual(Buffer.from(binaryData));

      await handle.destroy();
    });

    it("should create nested directories", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      await handle.upload(
        [{ path: "deep/nested/dir/file.txt", content: "Nested content" }],
        ".",
      );

      // Verify nested file
      const filePath = path.join(tempDir, "deep/nested/dir/file.txt");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("Nested content");

      await handle.destroy();
    });

    it("should upload to custom target directory", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      await handle.upload(
        [{ path: "file.txt", content: "Custom target" }],
        "custom/target",
      );

      // Verify file in custom location
      const filePath = path.join(tempDir, "custom/target/file.txt");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe("Custom target");

      await handle.destroy();
    });
  });

  describe("SandboxHandle.destroy", () => {
    it("should complete successfully", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      await expect(handle.destroy()).resolves.toBeUndefined();
    });

    it("should not delete the working directory by default", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

      await handle.upload([{ path: "file.txt", content: "Test" }], ".");
      await handle.destroy();

      // Directory should still exist
      const stat = await fs.stat(tempDir);
      expect(stat.isDirectory()).toBe(true);
      // File should still exist
      const filePath = path.join(tempDir, "file.txt");
      const fileStat = await fs.stat(filePath);
      expect(fileStat.isFile()).toBe(true);
    });
  });

  describe("Integration tests", () => {
    it("should support a complete workflow", async () => {
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

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
      const sandbox = new LocalMachine({ workdir: tempDir });
      const handle = await sandbox.attach();

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

  describe.skipIf(process.platform === "win32")(
    "process tree cleanup (abort/timeout)",
    () => {
      // Regression: a plain child.kill(signal) only signals the direct
      // child. If that child backgrounds its own grandchild (e.g. a shell's
      // `cmd &`, or a coding-agent CLI spawning a tool subprocess), the
      // grandchild survived as an orphan — confirmed by a live repro before
      // this fix. killProcessTree() (spawn with detached:true + signaling
      // the negative pid) reaps the whole group instead.
      const backgroundedSleep = (marker: string) => [
        "bash",
        "-c",
        `(exec -a ${marker} sleep 60) & echo started; sleep 60`,
      ];

      it("abort() kills a backgrounded grandchild, not just the direct child", async () => {
        const sandbox = new LocalMachine({ workdir: tempDir });
        const handle = await sandbox.attach();
        const marker = `orphan-test-abort-${process.pid}-${Date.now()}`;

        const controller = new AbortController();
        const chunks: string[] = [];
        const consume = (async () => {
          try {
            for await (const chunk of handle.exec(backgroundedSleep(marker), {
              signal: controller.signal,
            })) {
              chunks.push(new TextDecoder().decode(chunk));
            }
          } catch {
            // Expected: exec() rejects with "Command was aborted".
          }
        })();

        // Wait for the shell to actually background the grandchild.
        await new Promise((r) => setTimeout(r, 500));
        expect(isProcessRunning(marker)).toBe(true);

        controller.abort();
        await consume;

        // killProcessTree sends SIGTERM immediately; give it a moment to land.
        await new Promise((r) => setTimeout(r, 500));
        expect(isProcessRunning(marker)).toBe(false);

        await handle.destroy();
      }, 15000);

      it("timeout kills a backgrounded grandchild, not just the direct child", async () => {
        const sandbox = new LocalMachine({
          workdir: tempDir,
          defaultTimeout: 300,
        });
        const handle = await sandbox.attach();
        const marker = `orphan-test-timeout-${process.pid}-${Date.now()}`;

        const chunks: string[] = [];
        try {
          for await (const chunk of handle.exec(backgroundedSleep(marker))) {
            chunks.push(new TextDecoder().decode(chunk));
          }
          throw new Error("expected exec() to reject on timeout");
        } catch (error) {
          expect(String(error)).toContain("timed out");
        }

        await new Promise((r) => setTimeout(r, 500));
        expect(isProcessRunning(marker)).toBe(false);

        await handle.destroy();
      }, 15000);
    },
  );
});

describe("LocalSandbox (deprecated alias)", () => {
  it("is the same class as LocalMachine", () => {
    expect(LocalSandbox).toBe(LocalMachine);
    const sandbox = new LocalSandbox();
    expect(sandbox).toBeInstanceOf(LocalMachine);
  });
});
