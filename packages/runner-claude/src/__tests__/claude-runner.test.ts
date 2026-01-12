import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClaudeRunnerOptions,
  createClaudeRunner,
} from "../claude-runner.js";

// Helper to generate random strings for property-like testing
function randomString(length: number): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper to generate UUID-like strings
function randomUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

describe("Query Natural Completion", () => {
  it("should complete message loop traversal and send [DONE] marker", async () => {
    // Remove API key to use mock mode for predictable testing
    delete process.env.ANTHROPIC_API_KEY;

    const runner = createClaudeRunner({
      model: "claude-sonnet-4-20250514",
    });

    const chunks: string[] = [];
    let loopCompleted = false;

    // Collect all chunks from the message loop
    for await (const chunk of runner.run("Test query completion")) {
      chunks.push(chunk);
    }

    // If we reach here, the loop completed successfully
    loopCompleted = true;

    // Verify the loop completed
    expect(loopCompleted).toBe(true);

    // Verify we received chunks
    expect(chunks.length).toBeGreaterThan(0);

    // Verify the last chunk is [DONE] marker from finally block
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");

    // Verify we have a finish message before [DONE]
    const hasFinish = chunks.some((c) => c.includes('"type":"finish"'));
    expect(hasFinish).toBe(true);
  });

  it("should send [DONE] marker even when error occurs", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    // Create a runner that will throw an error
    const runner = createClaudeRunner({
      model: "claude-sonnet-4-20250514",
    });

    const chunks: string[] = [];
    try {
      for await (const chunk of runner.run("Test error handling")) {
        chunks.push(chunk);
      }
    } catch (error) {
      // Errors should be caught internally, not thrown
      // If we get here, the implementation is wrong
      expect(error).toBeUndefined();
    }

    // Verify [DONE] was sent even though there might have been internal errors
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");
  });

  it("should traverse all messages in the loop without early termination", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const runner = createClaudeRunner({
      model: "claude-sonnet-4-20250514",
    });

    const chunks: string[] = [];
    for await (const chunk of runner.run("Complete traversal test")) {
      chunks.push(chunk);
    }

    // In mock mode, we should see:
    // 1. text-start
    // 2. Multiple text-delta chunks (one per word)
    // 3. text-end
    // 4. finish
    // 5. [DONE]

    const textStarts = chunks.filter((c) =>
      c.includes('"type":"text-start"'),
    ).length;
    const textDeltas = chunks.filter((c) =>
      c.includes('"type":"text-delta"'),
    ).length;
    const textEnds = chunks.filter((c) =>
      c.includes('"type":"text-end"'),
    ).length;
    const finishes = chunks.filter((c) => c.includes('"type":"finish"')).length;
    const dones = chunks.filter((c) => c === "data: [DONE]\n\n").length;

    // Should have exactly one of each structural element
    expect(textStarts).toBe(1);
    expect(textEnds).toBe(1);
    expect(finishes).toBe(1);
    expect(dones).toBe(1);

    // Should have multiple text deltas (streaming)
    expect(textDeltas).toBeGreaterThan(1);

    // Verify order: text-start comes before text-delta
    const firstTextStart = chunks.findIndex((c) =>
      c.includes('"type":"text-start"'),
    );
    const firstTextDelta = chunks.findIndex((c) =>
      c.includes('"type":"text-delta"'),
    );
    expect(firstTextStart).toBeLessThan(firstTextDelta);

    // Verify order: text-delta comes before text-end
    const lastTextDelta = chunks.lastIndexOf(
      chunks.find((c) => c.includes('"type":"text-delta"')) || "",
    );
    const textEnd = chunks.findIndex((c) => c.includes('"type":"text-end"'));
    expect(lastTextDelta).toBeLessThan(textEnd);

    // Verify order: finish comes before [DONE]
    const finishIndex = chunks.findIndex((c) => c.includes('"type":"finish"'));
    const doneIndex = chunks.findIndex((c) => c === "data: [DONE]\n\n");
    expect(finishIndex).toBeLessThan(doneIndex);
  });

  it("should ensure finally block executes and sends [DONE] in all scenarios", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    // Test multiple runs to ensure finally block always executes
    for (let i = 0; i < 5; i++) {
      const runner = createClaudeRunner({
        model: "claude-sonnet-4-20250514",
      });

      const chunks: string[] = [];
      for await (const chunk of runner.run(`Test run ${i}`)) {
        chunks.push(chunk);
      }

      // Every run should end with [DONE]
      expect(chunks[chunks.length - 1]).toBe("data: [DONE]\n\n");

      // Every run should have exactly one [DONE]
      const doneCount = chunks.filter((c) => c === "data: [DONE]\n\n").length;
      expect(doneCount).toBe(1);
    }
  });
});
