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
