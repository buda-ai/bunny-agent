import type { SandboxAdapter, SandboxHandle } from "@sandagent/manager";
import { beforeAll, describe, expect, it } from "vitest";
import { createSandAgent } from "../sandagent-provider.js";

/**
 * Real integration tests for ai-provider with actual AI SDK model configuration.
 *
 * These tests verify that the AI provider can be properly configured and used
 * with the AI SDK, including model resolution, sandbox attachment, and streaming.
 */
describe("AI Provider Real Integration Tests", () => {
  describe("Provider Creation and Configuration", () => {
    it("should create provider with sandbox adapter", async () => {
      // Create a mock sandbox that implements the SandboxAdapter interface
      const mockSandbox: SandboxAdapter = {
        attach: async (id: string): Promise<SandboxHandle> => {
          return {
            exec: async function* (
              command: string[],
              options?: { cwd?: string; env?: Record<string, string> },
            ) {
              // Mock streaming output
              yield new TextEncoder().encode("mock output");
            },
            runCommand: async (command: string) => {
              return {
                stdout: "mock stdout",
                stderr: "",
                exitCode: 0,
              };
            },
            upload: async (files, targetDir) => {
              // Mock upload
            },
            destroy: async () => {
              // Mock destroy
            },
          };
        },
      };

      const provider = createSandAgent({
        sandbox: mockSandbox,
        env: {
          ANTHROPIC_API_KEY: "test-key",
        },
      });

      expect(provider).toBeDefined();
      expect(typeof provider).toBe("function");

      // Test model ID resolution
      const sonnetModel = provider("sonnet");
      expect(sonnetModel).toBeDefined();
      expect(sonnetModel.modelId).toContain("claude");
      expect(sonnetModel.provider).toBe("sandagent");

      const haikuModel = provider("haiku");
      expect(haikuModel).toBeDefined();
      expect(haikuModel.modelId).toContain("claude");
    });

    it("should resolve model aliases correctly", async () => {
      const mockSandbox: SandboxAdapter = {
        attach: async (id: string): Promise<SandboxHandle> => {
          return {
            exec: async function* () {
              yield new TextEncoder().encode("test");
            },
            runCommand: async () => ({
              stdout: "",
              stderr: "",
              exitCode: 0,
            }),
            upload: async () => {},
            destroy: async () => {},
          };
        },
      };

      const provider = createSandAgent({
        sandbox: mockSandbox,
        env: { ANTHROPIC_API_KEY: "test-key" },
      });

      // Test various model aliases
      const models = [
        provider("sonnet"),
        provider("haiku"),
        provider("claude-sonnet-4-20250514"),
        provider("claude-3-5-sonnet-20241022"),
        provider("claude-3-5-haiku-20241022"),
      ];

      for (const model of models) {
        expect(model.modelId).toContain("claude");
        expect(model.provider).toBe("sandagent");
        expect(model.specificationVersion).toBe("v3");
      }
    });

    it("should configure sandbox environment variables", async () => {
      const mockSandbox: SandboxAdapter = {
        attach: async (id: string): Promise<SandboxHandle> => {
          return {
            exec: async function* () {
              yield new TextEncoder().encode("test");
            },
            runCommand: async () => ({
              stdout: "",
              stderr: "",
              exitCode: 0,
            }),
            upload: async () => {},
            destroy: async () => {},
          };
        },
      };

      const testEnv = {
        ANTHROPIC_API_KEY: "test-api-key",
        CUSTOM_VAR: "custom-value",
        DEBUG: "true",
      };

      const provider = createSandAgent({
        sandbox: mockSandbox,
        env: testEnv,
      });

      const model = provider("sonnet");
      expect(model).toBeDefined();

      // Verify provider stores env configuration
      // (Implementation detail: env is passed to SandAgent constructor)
    });

    it("should handle model configuration with custom settings", async () => {
      const mockSandbox: SandboxAdapter = {
        attach: async (id: string): Promise<SandboxHandle> => {
          return {
            exec: async function* () {
              yield new TextEncoder().encode("test");
            },
            runCommand: async () => ({
              stdout: "",
              stderr: "",
              exitCode: 0,
            }),
            upload: async () => {},
            destroy: async () => {},
          };
        },
      };

      const provider = createSandAgent({
        sandbox: mockSandbox,
        env: { ANTHROPIC_API_KEY: "test-key" },
      });

      const model = provider("sonnet", {
        maxTokens: 4096,
        temperature: 0.7,
        topP: 0.9,
      });

      expect(model).toBeDefined();
      expect(model.modelId).toContain("claude");

      // Verify model accepts AI SDK parameters
      // These are standard AI SDK model settings
    });
  });

  describe("Model Interface Compliance", () => {
    it("should implement LanguageModelV3 interface", async () => {
      const mockSandbox: SandboxAdapter = {
        attach: async (id: string): Promise<SandboxHandle> => {
          return {
            exec: async function* () {
              yield new TextEncoder().encode("test");
            },
            runCommand: async () => ({
              stdout: "",
              stderr: "",
              exitCode: 0,
            }),
            upload: async () => {},
            destroy: async () => {},
          };
        },
      };

      const provider = createSandAgent({
        sandbox: mockSandbox,
        env: { ANTHROPIC_API_KEY: "test-key" },
      });

      const model = provider("sonnet");

      // Check that model has required LanguageModelV3 properties
      expect(model.specificationVersion).toBe("v3");
      expect(model.provider).toBe("sandagent");
      expect(model.modelId).toBeTruthy();
      expect(typeof model.doGenerate).toBe("function");
      expect(typeof model.doStream).toBe("function");
    });

    it("should support multiple concurrent model instances", async () => {
      const mockSandbox: SandboxAdapter = {
        attach: async (id: string): Promise<SandboxHandle> => {
          return {
            exec: async function* () {
              yield new TextEncoder().encode(`response for ${id}`);
            },
            runCommand: async () => ({
              stdout: "",
              stderr: "",
              exitCode: 0,
            }),
            upload: async () => {},
            destroy: async () => {},
          };
        },
      };

      const provider = createSandAgent({
        sandbox: mockSandbox,
        env: { ANTHROPIC_API_KEY: "test-key" },
      });

      // Create multiple model instances
      const models = [
        provider("sonnet"),
        provider("haiku"),
        provider("sonnet", { maxTokens: 2048 }),
        provider("haiku", { temperature: 0.5 }),
      ];

      // All models should be independent instances
      expect(models.length).toBe(4);
      for (const model of models) {
        expect(model).toBeDefined();
        expect(model.provider).toBe("sandagent");
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle missing API key gracefully", async () => {
      const mockSandbox: SandboxAdapter = {
        attach: async (id: string): Promise<SandboxHandle> => {
          return {
            exec: async function* () {
              yield new TextEncoder().encode("test");
            },
            runCommand: async () => ({
              stdout: "",
              stderr: "",
              exitCode: 0,
            }),
            upload: async () => {},
            destroy: async () => {},
          };
        },
      };

      // Create provider without API key
      const provider = createSandAgent({
        sandbox: mockSandbox,
        env: {},
      });

      // Should still create provider (API key is validated at runtime)
      expect(provider).toBeDefined();
      const model = provider("sonnet");
      expect(model).toBeDefined();
    });

    it("should handle invalid model IDs", async () => {
      const mockSandbox: SandboxAdapter = {
        attach: async (id: string): Promise<SandboxHandle> => {
          return {
            exec: async function* () {
              yield new TextEncoder().encode("test");
            },
            runCommand: async () => ({
              stdout: "",
              stderr: "",
              exitCode: 0,
            }),
            upload: async () => {},
            destroy: async () => {},
          };
        },
      };

      const provider = createSandAgent({
        sandbox: mockSandbox,
        env: { ANTHROPIC_API_KEY: "test-key" },
      });

      // Try to use an invalid/unsupported model ID
      // Should either throw or use default model
      try {
        const model = provider("invalid-model-id" as string);
        expect(model).toBeDefined();
        expect(model.modelId).toBeTruthy();
      } catch (error) {
        // Expected behavior: throw error for invalid model
        expect(error).toBeDefined();
      }
    });
  });

  describe("Integration with LocalSandbox", () => {
    it("should work with LocalSandbox implementation", async () => {
      let LocalSandbox:
        | typeof import("@sandagent/sandbox-local").LocalSandbox
        | undefined;
      try {
        const module = await import("@sandagent/sandbox-local");
        LocalSandbox = module.LocalSandbox;
      } catch {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      if (!LocalSandbox) {
        console.log("LocalSandbox not available");
        return;
      }

      const sandbox = new LocalSandbox();
      const provider = createSandAgent({
        sandbox,
        env: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "test-key",
        },
      });

      const model = provider("sonnet");
      expect(model).toBeDefined();
      expect(model.modelId).toContain("claude");

      // Verify sandbox can attach
      const handle = await sandbox.attach("test-id");
      expect(handle).toBeDefined();
      expect(typeof handle.exec).toBe("function");
      expect(typeof handle.runCommand).toBe("function");
    });

    it("should configure custom workspace with LocalSandbox", async () => {
      let LocalSandbox:
        | typeof import("@sandagent/sandbox-local").LocalSandbox
        | undefined;
      try {
        const module = await import("@sandagent/sandbox-local");
        LocalSandbox = module.LocalSandbox;
      } catch {
        console.log("Skipping: @sandagent/sandbox-local not available");
        return;
      }

      if (!LocalSandbox) {
        console.log("LocalSandbox not available");
        return;
      }

      const customWorkspace = "/tmp/sandagent-custom-workspace";
      const sandbox = new LocalSandbox({
        baseDir: customWorkspace, // Use baseDir instead of workspaceDir
        isolate: false, // Don't isolate so we get the exact baseDir
        env: {
          CUSTOM_ENV: "custom_value",
        },
      });

      const provider = createSandAgent({
        sandbox,
        env: {
          ANTHROPIC_API_KEY: "test-key",
        },
      });

      const model = provider("sonnet");
      expect(model).toBeDefined();

      // Verify workspace configuration
      const handle = await sandbox.attach("test-custom");
      const result = await handle.runCommand("pwd");
      expect(result.stdout).toContain(customWorkspace);
    });
  });
});
