import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClaudeRunner, type ClaudeRunnerOptions } from "../claude-runner.js";

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

    // First chunk should be text format (0:...)
    expect(chunks[0]).toMatch(/^0:/);

    // Last chunk should be finish message (d:...)
    expect(chunks[chunks.length - 1]).toMatch(/^d:/);
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

    // Combine all text chunks
    const fullText = chunks
      .filter((c) => c.startsWith("0:"))
      .map((c) => JSON.parse(c.slice(2)))
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

    // Combine all text chunks
    const fullText = chunks
      .filter((c) => c.startsWith("0:"))
      .map((c) => JSON.parse(c.slice(2)))
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

    // Combine all text chunks
    const fullText = chunks
      .filter((c) => c.startsWith("0:"))
      .map((c) => JSON.parse(c.slice(2)))
      .join("");

    // Should contain installation hint (updated to Claude Agent SDK)
    expect(fullText).toContain("@anthropic-ai/claude-agent-sdk");
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
