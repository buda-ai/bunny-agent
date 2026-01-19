import { beforeEach, describe, expect, it, vi } from "vitest";
import { SandockSandbox } from "../sandock-sandbox.js";

// Mock the sandock SDK
vi.mock("sandock", () => ({
  createSandockClient: vi.fn(() => ({
    DELETE: vi.fn().mockResolvedValue({
      data: { data: { id: "sandbox-123", deleted: true } },
      error: null,
    }),
    // High-level sandbox API with streaming support
    sandbox: {
      create: vi.fn().mockResolvedValue({
        success: true,
        data: { id: "sandbox-123" },
      }),
      start: vi.fn().mockResolvedValue({
        success: true,
        data: { id: "sandbox-123", started: true },
      }),
      shell: vi.fn().mockImplementation(
        (
          _sandboxId: string,
          _command: string,
          callbacks?: {
            onStdout?: (chunk: string) => void;
            onStderr?: (chunk: string) => void;
            onError?: (error: unknown) => void;
          },
        ) => {
          // Simulate streaming output
          if (callbacks?.onStdout) {
            callbacks.onStdout("command output");
          }
          return Promise.resolve({
            success: true,
            data: {
              stdout: "command output",
              stderr: "",
              exitCode: 0,
              timedOut: false,
              durationMs: 100,
            },
          });
        },
      ),
      stop: vi.fn().mockResolvedValue({
        success: true,
        data: { id: "sandbox-123", stopped: true },
      }),
      delete: vi.fn().mockResolvedValue({
        success: true,
        data: { id: "sandbox-123", deleted: true },
      }),
    },
    // High-level fs API
    fs: {
      write: vi.fn().mockResolvedValue({
        success: true,
        data: true,
      }),
    },
  })),
}));

describe("SandockSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set API key for tests
    process.env.SANDOCK_API_KEY = "test-api-key";
  });

  describe("constructor", () => {
    it("should use default values", () => {
      const sandbox = new SandockSandbox();
      expect(sandbox).toBeInstanceOf(SandockSandbox);
    });

    it("should accept custom options", () => {
      const sandbox = new SandockSandbox({
        baseUrl: "https://custom.sandock.ai",
        apiKey: "custom-api-key",
        image: "python:3.11-slim",
        workdir: "/app",
        memoryLimitMb: 1024,
        cpuShares: 512,
        keep: false,
      });
      expect(sandbox).toBeInstanceOf(SandockSandbox);
    });

    it("should warn when SANDOCK_API_KEY is not set", () => {
      delete process.env.SANDOCK_API_KEY;
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      new SandockSandbox();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("SANDOCK_API_KEY not set"),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("attach", () => {
    it("should implement SandboxAdapter interface", () => {
      const sandbox = new SandockSandbox();
      expect(typeof sandbox.attach).toBe("function");
    });

    it("should return a handle with required methods", async () => {
      const sandbox = new SandockSandbox();
      const handle = await sandbox.attach();

      expect(typeof handle.exec).toBe("function");
      expect(typeof handle.upload).toBe("function");
      expect(typeof handle.destroy).toBe("function");
    });

    it("should create and start sandbox via API", async () => {
      const sandbox = new SandockSandbox();
      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
    });
  });

  describe("SandboxHandle", () => {
    it("should execute commands and return output", async () => {
      const sandbox = new SandockSandbox();
      const handle = await sandbox.attach();

      const chunks: Uint8Array[] = [];
      for await (const chunk of handle.exec(["echo", "hello"])) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      const output = new TextDecoder().decode(chunks[0]);
      expect(output).toBe("command output");
    });

    it("should upload files via API", async () => {
      const sandbox = new SandockSandbox();
      const handle = await sandbox.attach();

      await handle.upload(
        [{ path: "test.txt", content: "Hello, World!" }],
        "/workspace",
      );
      // No error means success
    });

    it("should destroy sandbox via API", async () => {
      const sandbox = new SandockSandbox();
      const handle = await sandbox.attach();

      await handle.destroy();
      // No error means success
    });
  });
});

describe("SandockSandbox Configuration", () => {
  beforeEach(() => {
    process.env.SANDOCK_API_KEY = "test-api-key";
  });

  it("should support custom base URLs", () => {
    const sandbox = new SandockSandbox({
      baseUrl: "https://custom.sandock.ai",
    });
    expect(sandbox).toBeInstanceOf(SandockSandbox);
  });

  it("should support custom Docker images", () => {
    const images = [
      "sandockai/sandock-code:latest",
      "python:3.11-slim",
      "node:20-slim",
    ];
    for (const image of images) {
      const sandbox = new SandockSandbox({ image });
      expect(sandbox).toBeInstanceOf(SandockSandbox);
    }
  });

  it("should support memory and CPU limits", () => {
    const sandbox = new SandockSandbox({
      memoryLimitMb: 2048,
      cpuShares: 1024,
    });
    expect(sandbox).toBeInstanceOf(SandockSandbox);
  });

  it("should support keep option", () => {
    const keepTrue = new SandockSandbox({ keep: true });
    const keepFalse = new SandockSandbox({ keep: false });
    expect(keepTrue).toBeInstanceOf(SandockSandbox);
    expect(keepFalse).toBeInstanceOf(SandockSandbox);
  });
});
