import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @sandagent/runner-claude
vi.mock("@sandagent/runner-claude", () => ({
  createClaudeRunner: vi.fn().mockReturnValue({
    run: vi.fn().mockImplementation(async function* () {
      yield "data: test message\n\n";
    }),
  }),
}));

import { createClaudeRunner } from "@sandagent/runner-claude";
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
      model: "claude-sonnet-4-20250514",
      userInput: "Hello, world!",
      systemPrompt: "You are a helpful assistant",
      maxTurns: 5,
      allowedTools: ["bash", "write_file"],
    });

    // Explicit parameters override template values
    expect(createClaudeRunner).toHaveBeenCalledWith({
      model: "claude-sonnet-4-20250514",
      systemPrompt: "You are a helpful assistant",
      maxTurns: 5,
      allowedTools: ["bash", "write_file"],
    });
  });

  it("should stream output to stdout without modification", async () => {
    await runAgent({
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
      model: "claude-sonnet-4-20250514",
      userInput: "Create a file",
    });

    expect(mockRunner.run).toHaveBeenCalledWith("Create a file");
  });
});

/**
 * CLI Argument Parsing Tests
 *
 * Feature: tool-approval-flow, Property 2: CLI 参数解析正确性
 * Validates: Requirements 3.2, 3.3, 3.5
 *
 * These tests verify that CLI argument parsing correctly handles:
 * - --parent-tool-use-id parameter (tool call ID string)
 * - Passing these parameters through to the runner
 * - Preserving all existing CLI arguments
 */
describe("CLI Argument Parsing - Tool Approval Parameters", () => {
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    originalWrite = process.stdout.write;
    // @ts-ignore - mocking stdout.write
    process.stdout.write = vi.fn(() => true);
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    vi.clearAllMocks();
  });

  /**
   * Requirement 3.2: --parent-tool-use-id parameter accepts tool call ID string
   * Runner_CLI should add new optional --parent-tool-use-id parameter
   */
  it("should pass --parent-tool-use-id parameter to runner", async () => {
    const parentToolUseId = "toolu_parent_abc123";

    await runAgent({
      model: "claude-sonnet-4-20250514",
      userInput: "Continue conversation",
      parentToolUseId: parentToolUseId,
    });

    expect(createClaudeRunner).toHaveBeenCalled();
    const callArgs = vi.mocked(createClaudeRunner).mock.calls[0][0];
    expect(callArgs.parentToolUseId).toBe(parentToolUseId);
  });

  /**
   * Requirement 3.3: CLI passes parent-tool-use-id to Runner_Claude
   * Parameter should be passed when resuming after approval
   */
  it("should pass --parent-tool-use-id with --resume together", async () => {
    const parentToolUseId = "toolu_parent_xyz";
    const resume = "session-uuid-123";

    await runAgent({
      model: "claude-sonnet-4-20250514",
      userInput: "Continue",
      parentToolUseId: parentToolUseId,
      resume: resume,
    });

    expect(createClaudeRunner).toHaveBeenCalled();
    const callArgs = vi.mocked(createClaudeRunner).mock.calls[0][0];
    expect(callArgs.parentToolUseId).toBe(parentToolUseId);
    expect(callArgs.resume).toBe(resume);
  });

  /**
   * Requirement 3.5: CLI should not delete any existing command line arguments
   * All existing parameters should still work when new parameters are added
   */
  it("should preserve all existing CLI arguments when new parameters are added", async () => {
    const parentToolUseId = "toolu_parent_test";

    await runAgent({
      model: "claude-sonnet-4-20250514",
      userInput: "Test input",
      systemPrompt: "You are helpful",
      maxTurns: 10,
      allowedTools: ["bash", "read_file"],
      resume: "session-123",
      parentToolUseId: parentToolUseId,
    });

    expect(createClaudeRunner).toHaveBeenCalled();
    const callArgs = vi.mocked(createClaudeRunner).mock.calls[0][0];

    // Verify all existing parameters are preserved
    expect(callArgs.model).toBe("claude-sonnet-4-20250514");
    expect(callArgs.systemPrompt).toBe("You are helpful");
    expect(callArgs.maxTurns).toBe(10);
    expect(callArgs.allowedTools).toEqual(["bash", "read_file"]);
    expect(callArgs.resume).toBe("session-123");

    // Verify new parameters are also passed
    expect(callArgs.parentToolUseId).toBe(parentToolUseId);
  });

  /**
   * Requirement 3.4: When --parent-tool-use-id is not provided, CLI should maintain original behavior
   */
  it("should work without --parent-tool-use-id parameter (original behavior)", async () => {
    await runAgent({
      model: "claude-sonnet-4-20250514",
      userInput: "Hello",
    });

    expect(createClaudeRunner).toHaveBeenCalled();
    const callArgs = vi.mocked(createClaudeRunner).mock.calls[0][0];
    expect(callArgs.parentToolUseId).toBeUndefined();
  });
});
