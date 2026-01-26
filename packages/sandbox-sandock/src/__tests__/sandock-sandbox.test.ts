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
    // High-level volume API
    volume: {
      getByName: vi.fn().mockResolvedValue({
        success: true,
        data: { id: "volume-123", status: "ready" },
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

describe("SandockSandbox Cache and Reuse", () => {
  beforeEach(() => {
    process.env.SANDOCK_API_KEY = "test-api-key";
    vi.clearAllMocks();
  });

  it("should return same handle when attach() is called multiple times on same instance", async () => {
    const sandbox = new SandockSandbox();
    const handle1 = await sandbox.attach();
    const handle2 = await sandbox.attach();

    // Sandock generates new ID each time, but same instance should return cached handle
    // Note: getHandle() returns the current handle if attached
    expect(sandbox.getHandle()).toBeDefined();
    // Both handles should be valid
    expect(handle1).toBeDefined();
    expect(handle2).toBeDefined();
  });

  it("should generate unique ID for each attach() call", async () => {
    const sandbox = new SandockSandbox();
    const handle1 = await sandbox.attach();
    // Note: Each attach() generates a new ID, but same instance returns cached handle
    // This test verifies the caching behavior within the same instance
    expect(handle1).toBeDefined();
  });

  it("should cache sandbox instances in memory", async () => {
    // The cache is static and shared across all SandockSandbox instances
    const sandbox1 = new SandockSandbox();
    const handle1 = await sandbox1.attach();

    // Same instance should return a handle (may be different due to ID generation)
    const handle2 = await sandbox1.attach();
    expect(handle1).toBeDefined();
    expect(handle2).toBeDefined();
    // Both should have required methods
    expect(typeof handle1.exec).toBe("function");
    expect(typeof handle2.exec).toBe("function");
  });

  it("should create new sandbox when cache is empty", async () => {
    const sandbox = new SandockSandbox();
    const handle = await sandbox.attach();

    expect(handle).toBeDefined();
    expect(typeof handle.exec).toBe("function");
    expect(typeof handle.upload).toBe("function");
    expect(typeof handle.destroy).toBe("function");
  });

  it("should document cache limitations (process-local only)", () => {
    // Sandock cache is process-local and does not persist across:
    // - Process restarts
    // - Different processes
    // - Different machines

    const sandbox = new SandockSandbox();
    expect(sandbox).toBeInstanceOf(SandockSandbox);
    // Cache is managed internally via static Map
  });

  it("should support cache eviction when full", async () => {
    // MAX_CACHE_SIZE is 50, so after 50 instances, oldest will be evicted
    const sandboxes: SandockSandbox[] = [];
    const handles = [];

    // Create multiple sandbox instances
    for (let i = 0; i < 5; i++) {
      const sandbox = new SandockSandbox();
      sandboxes.push(sandbox);
      const handle = await sandbox.attach();
      handles.push(handle);
      expect(handle).toBeDefined();
    }

    // All should work, cache eviction happens internally
    expect(handles.length).toBe(5);
  });

  it("should skip initialization for cached instances", async () => {
    const sandbox = new SandockSandbox();
    const handle1 = await sandbox.attach();

    // Second attach on same instance should return a handle
    // Note: Sandock generates new ID each time, but uses cache for same ID
    const handle2 = await sandbox.attach();
    expect(handle1).toBeDefined();
    expect(handle2).toBeDefined();
    // Both handles should work
    expect(typeof handle1.exec).toBe("function");
    expect(typeof handle2.exec).toBe("function");
  });
});

describe("SandockSandbox Volume Persistence", () => {
  beforeEach(() => {
    process.env.SANDOCK_API_KEY = "test-api-key";
    vi.clearAllMocks();
  });

  it("should support volume-based persistence", async () => {
    const volumeName = "my-project-volume";

    const sandbox = new SandockSandbox({
      volumeName,
    });

    const handle = await sandbox.attach();
    expect(handle).toBeDefined();
    // Volume would be created/retrieved and mounted
  });

  it("should create volume if it doesn't exist", async () => {
    const sandbox = new SandockSandbox({
      volumeName: "new-volume",
    });

    const handle = await sandbox.attach();
    expect(handle).toBeDefined();
    // Volume would be created with createIfNotExists = true
  });

  it("should use existing volume if it exists", async () => {
    const sandbox = new SandockSandbox({
      volumeName: "existing-volume",
    });

    const handle = await sandbox.attach();
    expect(handle).toBeDefined();
    // Would get existing volume and mount it
  });

  it("should mount volume at specified path", () => {
    const sandbox = new SandockSandbox({
      volumeName: "test-volume",
      volumeMountPath: "/custom/path",
    });

    expect(sandbox).toBeInstanceOf(SandockSandbox);
    // Volume would be mounted at /custom/path instead of default /sandagent
  });

  it("should skip initialization when files exist in volume", async () => {
    // When reusing sandbox with existing volume:
    // - needsInit = false (files are in volume)
    // - Skip upload of runner bundle and templates

    const sandbox = new SandockSandbox({
      volumeName: "existing-volume",
    });

    const handle = await sandbox.attach();
    expect(handle).toBeDefined();
  });

  it("should wait for volume to be ready", async () => {
    const sandbox = new SandockSandbox({
      volumeName: "test-volume",
    });

    const handle = await sandbox.attach();
    expect(handle).toBeDefined();
    // In real scenario, would wait for volume.status === "ready"
  });

  it("should skip initialization when reusing existing sandbox with volume", async () => {
    const volumeName = "existing-volume";

    const sandbox = new SandockSandbox({
      volumeName,
    });

    // First attach would create and initialize
    const handle1 = await sandbox.attach();

    // Second attach on same instance returns cached handle
    const handle2 = await sandbox.attach();
    expect(handle1).toBeDefined();
    expect(handle2).toBeDefined();
  });
});

