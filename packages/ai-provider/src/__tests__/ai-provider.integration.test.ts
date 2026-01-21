/**
 * Integration tests for ai-provider
 * Tests AI SDK integration with actual model streaming
 */

import { describe, expect, it } from "vitest";
import { streamText } from "ai";
import { createSandAgent } from "@sandagent/ai-provider";
import { LocalSandbox } from "@sandagent/sandbox-local";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

describe("ai-provider Integration Tests", () => {
  const TIMEOUT = 30000;

  it("should create SandAgent provider", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "sandagent-test-"));
    
    const sandagent = createSandAgent({
      sandbox: new LocalSandbox({ baseDir: testDir }),
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "test-key",
      },
    });

    expect(sandagent).toBeDefined();
    expect(sandagent.languageModel).toBeDefined();
    expect(sandagent.chat).toBeDefined();
  }, TIMEOUT);

  it("should create language model with shorthand", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "sandagent-test-"));
    
    const sandagent = createSandAgent({
      sandbox: new LocalSandbox({ baseDir: testDir }),
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "test-key",
      },
    });

    const model = sandagent("sonnet");
    
    expect(model).toBeDefined();
    expect(model.provider).toBe("sandagent");
  }, TIMEOUT);

  it("should stream text with AI SDK (mock mode)", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "sandagent-test-"));
    
    const sandagent = createSandAgent({
      sandbox: new LocalSandbox({ baseDir: testDir }),
      env: {
        // Without real API key, this will fail gracefully
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
      },
      verbose: false,
    });

    const model = sandagent("sonnet", {
      sandboxId: "test-session-stream",
    });

    expect(model).toBeDefined();
    
    // Note: Actual streaming requires ANTHROPIC_API_KEY
    // This test just validates the model can be created and configured
  }, TIMEOUT);

  it("should support different model variations", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "sandagent-test-"));
    
    const sandagent = createSandAgent({
      sandbox: new LocalSandbox({ baseDir: testDir }),
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "test-key",
      },
    });

    const models = [
      sandagent("opus"),
      sandagent("sonnet"),
      sandagent("haiku"),
      sandagent.chat("sonnet"),
      sandagent.languageModel("opus"),
    ];

    for (const model of models) {
      expect(model).toBeDefined();
      expect(model.provider).toBe("sandagent");
    }
  }, TIMEOUT);

  it("should accept custom settings", async () => {
    const testDir = await mkdtemp(join(tmpdir(), "sandagent-test-"));
    
    const sandagent = createSandAgent({
      sandbox: new LocalSandbox({ baseDir: testDir }),
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "test-key",
      },
      verbose: true,
    });

    const model = sandagent("sonnet", {
      sandboxId: "custom-session",
      template: "coder",
      maxTurns: 10,
    });

    expect(model).toBeDefined();
  }, TIMEOUT);
});

describe("ai-provider with AI SDK streamText (requires API key)", () => {
  const TIMEOUT = 60000;

  it.skipIf(!process.env.ANTHROPIC_API_KEY)(
    "should stream text with real API key",
    async () => {
      const testDir = await mkdtemp(join(tmpdir(), "sandagent-test-"));
      
      const sandagent = createSandAgent({
        sandbox: new LocalSandbox({ baseDir: testDir }),
        env: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
        },
        verbose: false,
      });

      const model = sandagent("sonnet", {
        sandboxId: `test-${Date.now()}`,
      });

      const result = await streamText({
        model,
        prompt: "Say 'Hello from SandAgent integration test'",
      });

      let hasText = false;
      for await (const chunk of result.textStream) {
        if (chunk) {
          hasText = true;
        }
      }

      expect(hasText).toBe(true);
    },
    TIMEOUT
  );
});
