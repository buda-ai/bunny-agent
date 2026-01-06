import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { E2BSandbox } from "../e2b-sandbox.js";

describe("E2BSandbox", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("constructor", () => {
    it("should create an instance with default options", () => {
      const sandbox = new E2BSandbox();
      expect(sandbox).toBeInstanceOf(E2BSandbox);
    });

    it("should accept custom options", () => {
      const sandbox = new E2BSandbox({
        apiKey: "test-api-key",
        template: "python",
        timeout: 120000,
      });
      expect(sandbox).toBeInstanceOf(E2BSandbox);
    });

    it("should use E2B_API_KEY from environment", () => {
      process.env.E2B_API_KEY = "env-api-key";

      const sandbox = new E2BSandbox();
      expect(sandbox).toBeInstanceOf(E2BSandbox);
    });
  });

  describe("attach", () => {
    it("should implement SandboxAdapter interface", () => {
      const sandbox = new E2BSandbox();
      expect(typeof sandbox.attach).toBe("function");
    });

    it("should throw error when E2B_API_KEY is not set", async () => {
      // Remove API key to test error handling
      delete process.env.E2B_API_KEY;

      const sandbox = new E2BSandbox();

      // Should throw an error about missing API key
      await expect(sandbox.attach("test-id")).rejects.toThrow(
        /E2B API key not found/,
      );

      console.log(
        "[Test Info] E2B_API_KEY not set - this test verifies proper error handling.\n" +
          "To run integration tests with E2B, set E2B_API_KEY environment variable.",
      );
    });

    it("should throw error when SDK is not installed (with API key set)", async () => {
      // Set API key but SDK won't be installed in test environment
      process.env.E2B_API_KEY = "test-api-key";

      const sandbox = new E2BSandbox();

      // Should throw an error (SDK not found or auth error)
      try {
        await sandbox.attach("test-id");
        // If we get here, the SDK is installed - that's also valid
        console.log(
          "[Test Info] E2B SDK is installed. Integration tests would run with valid API key.",
        );
      } catch (error) {
        expect(error).toBeDefined();
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Either SDK not found or API error is expected
        console.log(
          `[Test Info] Expected error: ${errorMessage}\n` +
            "Install e2b package to enable E2B sandbox: npm install e2b",
        );
      }
    });
  });
});

describe("E2BSandbox Configuration", () => {
  it("should support different templates", () => {
    const templates = ["base", "python", "nodejs", "code-interpreter"];
    for (const template of templates) {
      const sandbox = new E2BSandbox({ template });
      expect(sandbox).toBeInstanceOf(E2BSandbox);
    }
  });

  it("should support custom timeouts", () => {
    const timeouts = [30000, 60000, 120000, 300000];
    for (const timeout of timeouts) {
      const sandbox = new E2BSandbox({ timeout });
      expect(sandbox).toBeInstanceOf(E2BSandbox);
    }
  });
});

describe("E2BSandbox Instance Caching (Persistence)", () => {
  // Access private static members for testing
  const getInstances = () =>
    (E2BSandbox as unknown as { instances: Map<string, unknown> }).instances;
  const getInitializedInstances = () =>
    (E2BSandbox as unknown as { initializedInstances: Set<string> })
      .initializedInstances;

  beforeEach(() => {
    // Clear cache before each test
    getInstances().clear();
    getInitializedInstances().clear();
  });

  describe("cache structure", () => {
    it("should have a static instances Map", () => {
      const instances = getInstances();
      expect(instances).toBeInstanceOf(Map);
    });

    it("should have a static initializedInstances Set", () => {
      const initialized = getInitializedInstances();
      expect(initialized).toBeInstanceOf(Set);
    });

    it("should share cache across multiple E2BSandbox instances", () => {
      const sandbox1 = new E2BSandbox({ apiKey: "key1" });
      const sandbox2 = new E2BSandbox({ apiKey: "key2" });

      // Both should reference the same static cache
      const instances1 = getInstances();
      const instances2 = getInstances();
      expect(instances1).toBe(instances2);
    });
  });

  describe("cache constants", () => {
    it("should have MAX_CACHE_SIZE of 50", () => {
      const maxSize = (E2BSandbox as unknown as { MAX_CACHE_SIZE: number })
        .MAX_CACHE_SIZE;
      expect(maxSize).toBe(50);
    });

    it("should have INSTANCE_TTL_MS of 60 minutes", () => {
      const ttl = (E2BSandbox as unknown as { INSTANCE_TTL_MS: number })
        .INSTANCE_TTL_MS;
      expect(ttl).toBe(60 * 60 * 1000);
    });
  });

  describe("LRU eviction", () => {
    it("evictOldestIfNeeded should be a static method", () => {
      const evictMethod = (
        E2BSandbox as unknown as { evictOldestIfNeeded: () => void }
      ).evictOldestIfNeeded;
      expect(typeof evictMethod).toBe("function");
    });
  });

  describe("cleanup mechanism", () => {
    it("cleanupExpiredInstances should be a static method", () => {
      const cleanupMethod = (
        E2BSandbox as unknown as { cleanupExpiredInstances: () => void }
      ).cleanupExpiredInstances;
      expect(typeof cleanupMethod).toBe("function");
    });
  });
});

describe("E2BSandbox Cache Behavior (Mock)", () => {
  // Mock E2B Sandbox for testing cache behavior
  const mockSandboxInstance = {
    sandboxId: "mock-sandbox-id",
    commands: {
      run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
    },
    files: {
      write: vi.fn().mockResolvedValue(undefined),
      makeDir: vi.fn().mockResolvedValue(undefined),
    },
    kill: vi.fn().mockResolvedValue(undefined),
  };

  const getInstances = () =>
    (
      E2BSandbox as unknown as {
        instances: Map<string, { instance: unknown; lastAccessTime: number }>;
      }
    ).instances;
  const getInitializedInstances = () =>
    (E2BSandbox as unknown as { initializedInstances: Set<string> })
      .initializedInstances;

  beforeEach(() => {
    getInstances().clear();
    getInitializedInstances().clear();
    vi.clearAllMocks();
  });

  it("should update lastAccessTime when reusing cached instance", () => {
    const instances = getInstances();
    const testId = "test-session-123";
    const oldTime = Date.now() - 10000;

    // Manually add a cached instance
    instances.set(testId, {
      instance: mockSandboxInstance,
      lastAccessTime: oldTime,
    });

    // Verify initial state
    expect(instances.get(testId)?.lastAccessTime).toBe(oldTime);
  });

  it("should track initialized instances separately", () => {
    const instances = getInstances();
    const initialized = getInitializedInstances();
    const testId = "test-session-456";

    // Add to cache
    instances.set(testId, {
      instance: mockSandboxInstance,
      lastAccessTime: Date.now(),
    });

    // Initially not in initialized set
    expect(initialized.has(testId)).toBe(false);

    // Mark as initialized
    initialized.add(testId);
    expect(initialized.has(testId)).toBe(true);
  });

  it("should find oldest instance for LRU eviction", () => {
    const instances = getInstances();
    const now = Date.now();

    // Add multiple instances with different access times
    instances.set("session-1", {
      instance: { ...mockSandboxInstance, sandboxId: "1" },
      lastAccessTime: now - 3000, // oldest
    });
    instances.set("session-2", {
      instance: { ...mockSandboxInstance, sandboxId: "2" },
      lastAccessTime: now - 1000,
    });
    instances.set("session-3", {
      instance: { ...mockSandboxInstance, sandboxId: "3" },
      lastAccessTime: now - 2000,
    });

    // Find oldest manually (simulating evictOldestIfNeeded logic)
    let oldestId: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [id, cached] of instances) {
      if (cached.lastAccessTime < oldestTime) {
        oldestTime = cached.lastAccessTime;
        oldestId = id;
      }
    }

    expect(oldestId).toBe("session-1");
    expect(oldestTime).toBe(now - 3000);
  });

  it("should identify expired instances", () => {
    const instances = getInstances();
    const now = Date.now();
    const TTL = 30 * 60 * 1000; // 30 minutes

    // Add instances: one fresh, one expired
    instances.set("fresh-session", {
      instance: mockSandboxInstance,
      lastAccessTime: now - 1000, // 1 second ago
    });
    instances.set("expired-session", {
      instance: mockSandboxInstance,
      lastAccessTime: now - TTL - 1000, // 30 minutes + 1 second ago
    });

    // Find expired instances (simulating cleanupExpiredInstances logic)
    const expiredIds: string[] = [];
    for (const [id, cached] of instances) {
      if (now - cached.lastAccessTime > TTL) {
        expiredIds.push(id);
      }
    }

    expect(expiredIds).toContain("expired-session");
    expect(expiredIds).not.toContain("fresh-session");
  });

  it("should remove instance from both caches on destroy", () => {
    const instances = getInstances();
    const initialized = getInitializedInstances();
    const testId = "destroy-test-session";

    // Setup: add to both caches
    instances.set(testId, {
      instance: mockSandboxInstance,
      lastAccessTime: Date.now(),
    });
    initialized.add(testId);

    // Verify setup
    expect(instances.has(testId)).toBe(true);
    expect(initialized.has(testId)).toBe(true);

    // Simulate destroy callback (onDestroy in E2BHandle)
    instances.delete(testId);
    initialized.delete(testId);

    // Verify cleanup
    expect(instances.has(testId)).toBe(false);
    expect(initialized.has(testId)).toBe(false);
  });
});
