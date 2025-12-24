import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @sandagent/runner-claude
vi.mock("@sandagent/runner-claude", () => ({
  createClaudeRunner: vi.fn().mockReturnValue({
    run: vi.fn().mockImplementation(async function* () {
      yield "data: test message\n\n";
    }),
  }),
}));

import { runAgent } from "../runner.js";
import { createClaudeRunner } from "@sandagent/runner-claude";

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

  it("should create a Claude runner with correct options", async () => {
    await runAgent({
      model: "claude-sonnet-4-20250514",
      userInput: "Hello, world!",
    });

    expect(createClaudeRunner).toHaveBeenCalledWith({
      model: "claude-sonnet-4-20250514",
      systemPrompt: undefined,
      maxTurns: undefined,
      allowedTools: undefined,
    });
  });

  it("should pass optional parameters to runner", async () => {
    await runAgent({
      model: "claude-sonnet-4-20250514",
      userInput: "Hello, world!",
      systemPrompt: "You are a helpful assistant",
      maxTurns: 5,
      allowedTools: ["bash", "write_file"],
    });

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
