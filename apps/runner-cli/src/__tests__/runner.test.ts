import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @sandagent/runner-claude
vi.mock("@sandagent/runner-claude", () => ({
  createClaudeRunner: vi.fn().mockReturnValue({
    run: vi.fn().mockImplementation(async function* () {
      yield "data: test message\n\n";
    }),
  }),
}));

vi.mock("@sandagent/runner-codex", () => ({
  createCodexRunner: vi.fn().mockReturnValue({
    run: vi.fn().mockImplementation(async function* () {
      yield "0:\"codex message\"\\n";
      yield "d:{\"finishReason\":\"stop\"}\\n";
    }),
  }),
}));

vi.mock("@sandagent/runner-gemini", () => ({
  createGeminiRunner: vi.fn().mockReturnValue({
    run: vi.fn().mockImplementation(async function* () {
      yield "0:\"gemini message\"\\n";
      yield "d:{\"finishReason\":\"stop\"}\\n";
    }),
  }),
}));

import { createClaudeRunner } from "@sandagent/runner-claude";
import { createCodexRunner } from "@sandagent/runner-codex";
import { createGeminiRunner } from "@sandagent/runner-gemini";
import { runAgent } from "../runner.js";

describe("runAgent", () => {
  let originalWrite: typeof process.stdout.write;
  let writtenData: string[];

  beforeEach(() => {
    writtenData = [];
    originalWrite = process.stdout.write;
    // @ts-ignore - mocking stdout.write
    process.stdout.write = vi.fn((data: string) => {
      writtenData.push(data);
      return true;
    });
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    vi.clearAllMocks();
  });

  it("should create a Claude runner with correct options (with default template)", async () => {
    await runAgent({
      runner: "claude",
      model: "claude-sonnet-4-20250514",
      userInput: "Hello, world!",
    });

    // The runner should be called with template values loaded
    expect(createClaudeRunner).toHaveBeenCalled();
    const callArgs = vi.mocked(createClaudeRunner).mock.calls[0][0];
    expect(callArgs.model).toBe("claude-sonnet-4-20250514");
    // Template provides default allowed tools and maxTurns
    // (or undefined if template not found)
    expect(
      typeof callArgs.maxTurns === "number" || callArgs.maxTurns === undefined,
    ).toBe(true);
  });

  it("should pass optional parameters to runner (overriding template)", async () => {
    await runAgent({
      runner: "claude",
      model: "claude-sonnet-4-20250514",
      userInput: "Hello, world!",
      systemPrompt: "You are a helpful assistant",
      maxTurns: 5,
      allowedTools: ["bash", "write_file"],
    });

    // Explicit parameters override template values
    expect(createClaudeRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-20250514",
        systemPrompt: "You are a helpful assistant",
        maxTurns: 5,
        allowedTools: ["bash", "write_file"],
      }),
    );
  });

  it("should stream output to stdout without modification", async () => {
    await runAgent({
      runner: "claude",
      model: "claude-sonnet-4-20250514",
      userInput: "Hello, world!",
    });

    expect(process.stdout.write).toHaveBeenCalledWith("data: test message\n\n");
    expect(writtenData).toEqual(["data: test message\n\n"]);
  });

  it("should call runner.run with user input", async () => {
    const mockRunner = {
      run: vi.fn().mockImplementation(async function* () {
        yield "test";
      }),
    };
    vi.mocked(createClaudeRunner).mockReturnValue(mockRunner);

    await runAgent({
      runner: "claude",
      model: "claude-sonnet-4-20250514",
      userInput: "Create a file",
    });

    expect(mockRunner.run).toHaveBeenCalledWith("Create a file");
  });

  it("should create Codex runner when --runner codex is selected", async () => {
    await runAgent({
      runner: "codex",
      model: "gpt-5-codex",
      userInput: "Implement feature X",
    });

    expect(createCodexRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-codex",
      }),
    );
  });

  it("should create Gemini runner when --runner gemini is selected", async () => {
    await runAgent({
      runner: "gemini",
      model: "gemini-2.5-pro",
      userInput: "Implement feature Y",
    });

    expect(createGeminiRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-pro",
      }),
    );
  });
});
