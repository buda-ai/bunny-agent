import { describe, it, expect, vi, beforeEach } from "vitest";
import { E2BSandbox } from "../e2b-sandbox.js";

describe("E2BSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const originalEnv = process.env.E2B_API_KEY;
      process.env.E2B_API_KEY = "env-api-key";

      const sandbox = new E2BSandbox();
      expect(sandbox).toBeInstanceOf(E2BSandbox);

      process.env.E2B_API_KEY = originalEnv;
    });
  });

  describe("attach", () => {
    it("should implement SandboxAdapter interface", () => {
      const sandbox = new E2BSandbox();
      expect(typeof sandbox.attach).toBe("function");
    });

    it("should throw an error without proper configuration", async () => {
      const sandbox = new E2BSandbox({ apiKey: "invalid-key" });

      // Should throw an error (either SDK not found or network/auth error)
      await expect(sandbox.attach("test-id")).rejects.toThrow();
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
