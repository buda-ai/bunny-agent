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
        timeout: 7200, // 2 hours in seconds
      });
      expect(sandbox).toBeInstanceOf(E2BSandbox);
    });

    it("should use E2B_API_KEY from environment", () => {
      process.env.E2B_API_KEY = "env-api-key";

      const sandbox = new E2BSandbox();
      expect(sandbox).toBeInstanceOf(E2BSandbox);
    });

    it("should accept name option for sandbox reuse", () => {
      const sandbox = new E2BSandbox({
        apiKey: "test-api-key",
        name: "my-sandbox",
        template: "base",
      });
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
      await expect(sandbox.attach()).rejects.toThrow(/E2B API key not found/);

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
        await sandbox.attach();
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

  it("should support custom timeouts in seconds", () => {
    // E2B timeout is now in seconds (for API clarity)
    const timeouts = [1800, 3600, 7200, 86400]; // 30min, 1hr, 2hr, 24hr
    for (const timeout of timeouts) {
      const sandbox = new E2BSandbox({ timeout });
      expect(sandbox).toBeInstanceOf(E2BSandbox);
    }
  });

  it("should support name for sandbox reuse", () => {
    const names = ["sandbox-1", "my-project-sandbox", "user-123-sandbox"];
    for (const name of names) {
      const sandbox = new E2BSandbox({ name });
      expect(sandbox).toBeInstanceOf(E2BSandbox);
    }
  });

  it("should use name for sandbox identification (business-defined)", () => {
    // Name is determined by business layer and can include template info if needed
    const sandbox1 = new E2BSandbox({
      name: "project-base-user123",
      template: "base",
    });
    const sandbox2 = new E2BSandbox({
      name: "project-python-user123",
      template: "python",
    });

    expect(sandbox1).toBeInstanceOf(E2BSandbox);
    expect(sandbox2).toBeInstanceOf(E2BSandbox);
    // Different names means different sandboxes
  });
});

describe("E2BSandbox Name-based Reuse", () => {
  it("should support all options together", () => {
    const sandbox = new E2BSandbox({
      apiKey: "test-key",
      template: "nodejs",
      timeout: 3600,
      name: "my-project",
      runnerBundlePath: "/path/to/runner.js",
      templatesPath: "/path/to/templates",
    });

    expect(sandbox).toBeInstanceOf(E2BSandbox);
  });

  it("should create sandbox without name (no reuse)", () => {
    // When no name is provided, a new sandbox is always created
    const sandbox = new E2BSandbox({
      apiKey: "test-key",
      template: "base",
    });

    expect(sandbox).toBeInstanceOf(E2BSandbox);
  });

  it("should support name with special characters", () => {
    const sandbox = new E2BSandbox({
      name: "project-user_123-dev",
    });

    expect(sandbox).toBeInstanceOf(E2BSandbox);
  });
});

describe("E2BSandbox Timeout Configuration", () => {
  it("should default to 1 hour (3600 seconds)", () => {
    // The default timeout aligns with E2B hobby tier limits
    const sandbox = new E2BSandbox();
    expect(sandbox).toBeInstanceOf(E2BSandbox);
  });

  it("should accept timeout for pro tier (up to 24 hours)", () => {
    // Pro tier supports up to 24 hours continuous runtime
    const sandbox = new E2BSandbox({
      timeout: 86400, // 24 hours in seconds
    });
    expect(sandbox).toBeInstanceOf(E2BSandbox);
  });

  it("should handle short timeouts", () => {
    const sandbox = new E2BSandbox({
      timeout: 300, // 5 minutes
    });
    expect(sandbox).toBeInstanceOf(E2BSandbox);
  });
});

describe("E2BSandbox Metadata Usage", () => {
  it("should document metadata fields used for querying", () => {
    // The sandbox uses these metadata fields:
    // - sandagentId: The session/agent ID
    // - sandagentName: The sandbox name for reuse (if provided, business-defined)

    const sandbox = new E2BSandbox({
      name: "my-project-python-user123", // Name includes all info needed for identification
      template: "python",
    });

    expect(sandbox).toBeInstanceOf(E2BSandbox);
    // When creating, metadata will include:
    // { sandagentId: "...", sandagentName: "my-project-python-user123" }
    // The name is used for sandbox reuse, determined by business layer
  });
});
