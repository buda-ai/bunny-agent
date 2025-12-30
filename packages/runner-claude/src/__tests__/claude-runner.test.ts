import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClaudeRunnerOptions,
  createClaudeRunner,
} from "../claude-runner.js";

describe("createClaudeRunner", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should create a runner with run method", () => {
    const runner = createClaudeRunner({
      model: "claude-sonnet-4-20250514",
    });

    expect(runner).toBeDefined();
    expect(typeof runner.run).toBe("function");
  });

  it("should return an async iterable from run", async () => {
    const runner = createClaudeRunner({
      model: "claude-sonnet-4-20250514",
    });

    const result = runner.run("Hello, world!");

    expect(result[Symbol.asyncIterator]).toBeDefined();
  });

  it("should yield AI SDK UI formatted chunks in mock mode", async () => {
    // Remove API key to force mock mode
    delete process.env.ANTHROPIC_API_KEY;

    const runner = createClaudeRunner({
      model: "claude-sonnet-4-20250514",
    });

    const chunks: string[] = [];
    for await (const chunk of runner.run("Test input")) {
      chunks.push(chunk);
    }

    // Should have yielded some chunks
    expect(chunks.length).toBeGreaterThan(0);

    // First chunk should be data stream format (data: {...})
    expect(chunks[0]).toMatch(/^data: /);

    // Should have text-start chunk
    expect(chunks.some((c) => c.includes('"type":"text-start"'))).toBe(true);

    // Should have text-delta chunks
    expect(chunks.some((c) => c.includes('"type":"text-delta"'))).toBe(true);

    // Should have text-end chunk
    expect(chunks.some((c) => c.includes('"type":"text-end"'))).toBe(true);

    // Should have finish chunk
    expect(chunks.some((c) => c.includes('"type":"finish"'))).toBe(true);

    // Last chunk should be [DONE]
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
  });

  it("should include user input in mock response", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const runner = createClaudeRunner({
      model: "claude-sonnet-4-20250514",
    });

    const chunks: string[] = [];
    for await (const chunk of runner.run("My special request")) {
      chunks.push(chunk);
    }

    // Combine all text-delta chunks
    const fullText = chunks
      .filter((c) => c.includes('"type":"text-delta"'))
      .map((c) => {
        const json = JSON.parse(c.replace("data: ", "").trim());
        return json.delta || "";
      })
      .join("");

    // Should contain the user input
    expect(fullText).toContain("My special request");
  });

  it("should include model name in mock response", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const runner = createClaudeRunner({
      model: "claude-3-5-sonnet-20241022",
    });

    const chunks: string[] = [];
    for await (const chunk of runner.run("Test")) {
      chunks.push(chunk);
    }

    // Combine all text-delta chunks
    const fullText = chunks
      .filter((c) => c.includes('"type":"text-delta"'))
      .map((c) => {
        const json = JSON.parse(c.replace("data: ", "").trim());
        return json.delta || "";
      })
      .join("");

    // Should contain the model name
    expect(fullText).toContain("claude-3-5-sonnet-20241022");
  });

  it("should include installation instructions in mock response", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const runner = createClaudeRunner({
      model: "claude-sonnet-4-20250514",
    });

    const chunks: string[] = [];
    for await (const chunk of runner.run("Test")) {
      chunks.push(chunk);
    }

    // Combine all text-delta chunks
    const fullText = chunks
      .filter((c) => c.includes('"type":"text-delta"'))
      .map((c) => {
        const json = JSON.parse(c.replace("data: ", "").trim());
        return json.delta || "";
      })
      .join("");

    // Should contain installation hint
    expect(fullText).toContain("ANTHROPIC_API_KEY");
  });
});

describe("ClaudeRunnerOptions", () => {
  it("should accept all optional parameters", () => {
    const options: ClaudeRunnerOptions = {
      model: "claude-sonnet-4-20250514",
      systemPrompt: "You are a helpful assistant",
      maxTurns: 10,
      allowedTools: ["bash", "write_file"],
    };

    const runner = createClaudeRunner(options);
    expect(runner).toBeDefined();
  });

  it("should work with minimal options", () => {
    const options: ClaudeRunnerOptions = {
      model: "claude-sonnet-4-20250514",
    };

    const runner = createClaudeRunner(options);
    expect(runner).toBeDefined();
  });
});
