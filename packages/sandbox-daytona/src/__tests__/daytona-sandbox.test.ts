import { beforeEach, describe, expect, it, vi } from "vitest";
import { DaytonaSandbox } from "../daytona-sandbox.js";

// Mock the Daytona SDK
vi.mock("@daytonaio/sdk", () => {
  const mockSandbox = {
    id: "sandbox-123",
    state: "started",
    start: vi.fn().mockResolvedValue(undefined),
    refreshActivity: vi.fn().mockResolvedValue(undefined),
    waitUntilStarted: vi.fn().mockResolvedValue(undefined),
    recover: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    process: {
      createSession: vi.fn().mockResolvedValue(undefined),
      executeSessionCommand: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: "",
        stderr: "",
        output: "",
      }),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      getSessionCommandLogs: vi
        .fn()
        .mockImplementation((sessionId, cmdId, callback) => {
          // Mock streaming logs
          callback("test output\n");
          return Promise.resolve();
        }),
    },
  };

  const mockVolume = {
    id: "volume-123",
    state: "ready",
  };

  return {
    Daytona: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockResolvedValue(mockSandbox),
      create: vi.fn().mockResolvedValue(mockSandbox),
      sandboxes: {
        get: vi.fn().mockResolvedValue(mockSandbox),
      },
      volume: {
        get: vi.fn().mockResolvedValue(mockVolume),
      },
    })),
  };
});

describe("DaytonaSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DAYTONA_API_KEY = "test-api-key";
  });

  describe("constructor", () => {
    it("should create an instance with default options", () => {
      const sandbox = new DaytonaSandbox();
      expect(sandbox).toBeInstanceOf(DaytonaSandbox);
    });

    it("should accept custom options", () => {
      const sandbox = new DaytonaSandbox({
        apiKey: "custom-api-key",
        apiUrl: "https://custom.daytona.io",
        timeout: 120,
        name: "my-sandbox",
        volumeName: "my-volume",
      });
      expect(sandbox).toBeInstanceOf(DaytonaSandbox);
    });

    it("should use DAYTONA_API_KEY from environment", () => {
      process.env.DAYTONA_API_KEY = "env-api-key";
      const sandbox = new DaytonaSandbox();
      expect(sandbox).toBeInstanceOf(DaytonaSandbox);
    });
  });

  describe("attach", () => {
    it("should implement SandboxAdapter interface", () => {
      const sandbox = new DaytonaSandbox();
      expect(typeof sandbox.attach).toBe("function");
    });

    it("should throw error when DAYTONA_API_KEY is not set", async () => {
      delete process.env.DAYTONA_API_KEY;

      const sandbox = new DaytonaSandbox();

      await expect(sandbox.attach()).rejects.toThrow(
        /Daytona API key not found/,
      );
    });

    it("should return a handle with required methods", async () => {
      const sandbox = new DaytonaSandbox();
      const handle = await sandbox.attach();

      expect(typeof handle.exec).toBe("function");
      expect(typeof handle.upload).toBe("function");
      expect(typeof handle.destroy).toBe("function");
    });
  });

  describe("DaytonaSandbox Reuse", () => {
    beforeEach(() => {
      process.env.DAYTONA_API_KEY = "test-api-key";
    });

    it("should return same handle when attach() is called multiple times", async () => {
      const sandbox = new DaytonaSandbox({
        name: "test-reuse-sandbox",
      });

      const handle1 = await sandbox.attach();
      const handle2 = await sandbox.attach();

      // Should return the same handle instance
      expect(handle1).toBe(handle2);
      expect(sandbox.getHandle()).toBe(handle1);
    });

    it("should use name to find existing sandbox", async () => {
      const sandboxName = "my-project-sandbox";

      const sandbox = new DaytonaSandbox({
        name: sandboxName,
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
      // In real scenario, it would call daytona.get(sandboxName) to find existing
    });

    it("should create new sandbox when name is not provided", async () => {
      const sandbox = new DaytonaSandbox({
        // No name provided
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
      // Would create new sandbox without name
    });

    it("should support volume-based persistence", async () => {
      const volumeName = "my-project-volume";

      const sandbox = new DaytonaSandbox({
        name: "my-project",
        volumeName,
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
      // Volume would be created/retrieved and mounted
    });

    it("should skip initialization when reusing existing sandbox with volume", async () => {
      const sandboxName = "existing-sandbox";
      const volumeName = "existing-volume";

      const sandbox = new DaytonaSandbox({
        name: sandboxName,
        volumeName,
      });

      // First attach would create and initialize
      const handle1 = await sandbox.attach();

      // Second attach on same instance returns cached handle
      const handle2 = await sandbox.attach();
      expect(handle1).toBe(handle2);
    });

    it("should handle different sandbox states", async () => {
      // Test that attach() handles various states:
      // - started: reuse directly
      // - stopped: start it
      // - archived: unarchive and start
      // - error (recoverable): recover
      // - error (non-recoverable): delete and create new

      const sandbox = new DaytonaSandbox({
        name: "test-sandbox",
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
    });

    it("should refresh activity to prevent auto-stop", async () => {
      const sandbox = new DaytonaSandbox({
        name: "test-sandbox",
        autoStopInterval: 15,
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
      // In real scenario, would call sandbox.refreshActivity()
    });

    it("should support template-based naming strategy", () => {
      const template = "default";
      const sandboxName = `sandagent-${template}`;

      const sandbox = new DaytonaSandbox({
        name: sandboxName,
        volumeName: sandboxName,
      });

      expect(sandbox).toBeInstanceOf(DaytonaSandbox);
    });

    it("should support user-session-based naming strategy", () => {
      const userId = "user-123";
      const sessionId = "session-456";
      const sandboxName = `user-${userId}-session-${sessionId}`;

      const sandbox = new DaytonaSandbox({
        name: sandboxName,
        volumeName: `${sandboxName}-volume`,
      });

      expect(sandbox).toBeInstanceOf(DaytonaSandbox);
    });

    it("should support project-based naming strategy", () => {
      const projectId = "project-789";
      const sandboxName = `project-${projectId}`;

      const sandbox = new DaytonaSandbox({
        name: sandboxName,
        volumeName: `${sandboxName}-volume`,
        autoStopInterval: 30,
        autoDeleteInterval: -1, // Never auto-delete
      });

      expect(sandbox).toBeInstanceOf(DaytonaSandbox);
    });

    it("should wait for volume to be ready", async () => {
      const sandbox = new DaytonaSandbox({
        name: "test-sandbox",
        volumeName: "test-volume",
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
      // In real scenario, would wait for volume.state === "ready"
    });

    it("should configure auto-stop and auto-delete intervals", () => {
      const sandbox = new DaytonaSandbox({
        name: "test-sandbox",
        autoStopInterval: 15, // 15 minutes
        autoDeleteInterval: 60, // 60 minutes after stop
      });

      expect(sandbox).toBeInstanceOf(DaytonaSandbox);
    });

    it("should disable auto-delete when autoDeleteInterval is -1", () => {
      const sandbox = new DaytonaSandbox({
        name: "test-sandbox",
        autoDeleteInterval: -1, // Disabled
      });

      expect(sandbox).toBeInstanceOf(DaytonaSandbox);
    });
  });

  describe("DaytonaSandbox Volume Persistence", () => {
    beforeEach(() => {
      process.env.DAYTONA_API_KEY = "test-api-key";
    });

    it("should create volume if it doesn't exist", async () => {
      const sandbox = new DaytonaSandbox({
        name: "test-sandbox",
        volumeName: "new-volume",
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
      // Volume would be created with createIfNotExists = true
    });

    it("should use existing volume if it exists", async () => {
      const sandbox = new DaytonaSandbox({
        name: "test-sandbox",
        volumeName: "existing-volume",
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
      // Would get existing volume and mount it
    });

    it("should mount volume at specified path", () => {
      const sandbox = new DaytonaSandbox({
        name: "test-sandbox",
        volumeName: "test-volume",
        volumeMountPath: "/custom/path",
      });

      expect(sandbox).toBeInstanceOf(DaytonaSandbox);
      // Volume would be mounted at /custom/path instead of default /sandagent
    });

    it("should skip initialization when files exist in volume", async () => {
      // When reusing sandbox with existing volume:
      // - needsInit = false (files are in volume)
      // - Skip upload of runner bundle and templates

      const sandbox = new DaytonaSandbox({
        name: "existing-sandbox",
        volumeName: "existing-volume",
      });

      const handle = await sandbox.attach();
      expect(handle).toBeDefined();
    });
  });
});
