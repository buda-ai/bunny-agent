import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClaudeRunnerOptions,
  buildSDKUserMessage,
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

describe("buildSDKUserMessage - Property Tests", () => {
  it("should construct SDKUserMessage with correct structure for any valid inputs (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const toolOutput = randomString(Math.floor(Math.random() * 100) + 1);
      const parentToolUseId = `toolu_${randomString(20)}`;
      const sessionId = randomUUID();

      const result = buildSDKUserMessage(
        toolOutput,
        parentToolUseId,
        sessionId,
      );

      expect(result.type).toBe("user");

      expect(result.message.role).toBe("user");

      expect(Array.isArray(result.message.content)).toBe(true);
      expect(result.message.content.length).toBe(1);
      expect(result.message.content[0].type).toBe("tool_result");

      expect(result.message.content[0].tool_use_id).toBe(parentToolUseId);

      expect(result.message.content[0].is_error).toBe(false);

      expect(result.parent_tool_use_id).toBe(parentToolUseId);

      expect(result.session_id).toBe(sessionId);

      expect(result.tool_use_result).toBe(true);
    }
  });

  /**
   * Property: JSON toolOutput should be parsed and stored in content
   *
   * When toolOutput is valid JSON, it should be parsed and stored as object.
   *
   */
  it("should handle JSON toolOutput by parsing it (100 iterations)", () => {
    const jsonValues = [
      { key: "value" },
      [1, 2, 3],
      "simple string",
      123,
      true,
      null,
      { nested: { deep: "value" } },
      { array: [1, "two", { three: 3 }] },
    ];

    for (let i = 0; i < 100; i++) {
      const jsonValue = jsonValues[i % jsonValues.length];
      const toolOutput = JSON.stringify(jsonValue);
      const parentToolUseId = `toolu_${randomString(20)}`;
      const sessionId = randomUUID();

      const result = buildSDKUserMessage(
        toolOutput,
        parentToolUseId,
        sessionId,
      );

      // Content should be the parsed JSON value
      expect(result.message.content[0].content).toEqual(jsonValue);
    }
  });

  /**
   * Property: Non-JSON toolOutput should be stored as-is
   *
   * When toolOutput is not valid JSON, it should be stored as the original string.
   *
   */
  it("should preserve non-JSON toolOutput as string (100 iterations)", () => {
    const nonJsonStrings = [
      "Hello world",
      "This is not JSON",
      "{invalid json",
      "user selected option A",
      "The answer is 42",
      "Special chars: @#$%^&*()",
      "Multi\nline\nstring",
    ];

    for (let i = 0; i < 100; i++) {
      // Use predefined non-JSON strings or generate random ones
      const toolOutput =
        i < nonJsonStrings.length
          ? nonJsonStrings[i]
          : `Random non-JSON: ${randomString(30)}`;
      const parentToolUseId = `toolu_${randomString(20)}`;
      const sessionId = randomUUID();

      const result = buildSDKUserMessage(
        toolOutput,
        parentToolUseId,
        sessionId,
      );

      // Content should be the original string (not parsed)
      expect(result.message.content[0].content).toBe(toolOutput);
    }
  });

  /**
   * Property: Session ID consistency
   *
   * The session_id in the result should always match the input sessionId.
   *
   */
  it("should maintain session_id consistency across all inputs (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const toolOutput = randomString(50);
      const parentToolUseId = `toolu_${randomString(20)}`;
      const sessionId = randomUUID();

      const result = buildSDKUserMessage(
        toolOutput,
        parentToolUseId,
        sessionId,
      );

      // Session ID must be exactly preserved
      expect(result.session_id).toBe(sessionId);
    }
  });
});
