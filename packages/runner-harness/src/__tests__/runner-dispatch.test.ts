import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRunner, type RunnerToolRef } from "../runner.js";

type RunnerOptions = Record<string, unknown>;

const claudeRun = vi.fn((_userInput: string) => (async function* () {})());
const createClaudeRunner = vi.fn((_options: RunnerOptions) => ({
  run: claudeRun,
}));
const piRun = vi.fn((_userInput: string) => (async function* () {})());
const createPiRunner = vi.fn((_options: RunnerOptions) => ({ run: piRun }));

vi.mock("@bunny-agent/runner-claude", () => ({
  createClaudeRunner: (options: RunnerOptions) => createClaudeRunner(options),
}));
vi.mock("@bunny-agent/runner-pi", () => ({
  createPiRunner: (options: RunnerOptions) => createPiRunner(options),
}));
vi.mock("@bunny-agent/runner-codex", () => ({ createCodexRunner: vi.fn() }));
vi.mock("@bunny-agent/runner-gemini", () => ({ createGeminiRunner: vi.fn() }));
vi.mock("@bunny-agent/runner-opencode", () => ({
  createOpenCodeRunner: vi.fn(),
}));

const toolRefs: RunnerToolRef[] = [
  {
    name: "lookup",
    description: "Look something up",
    inputSchema: { type: "object", properties: {} },
    runtime: { type: "http", url: "https://example.com/lookup" },
  },
];

describe("createRunner dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes toolRefs and skillPaths to the claude runner", () => {
    createRunner({
      runner: "claude",
      model: "claude-sonnet-4-20250514",
      userInput: "hello",
      cwd: "/tmp",
      autoInject: false,
      toolRefs,
      skillPaths: ["/tmp/skills/foo"],
    });

    expect(createClaudeRunner).toHaveBeenCalledTimes(1);
    const opts = createClaudeRunner.mock.calls[0][0];
    expect(opts.toolRefs).toEqual(toolRefs);
    expect(opts.skillPaths).toEqual(["/tmp/skills/foo"]);
    expect(claudeRun).toHaveBeenCalledWith("hello");
  });

  it("keeps passing toolRefs and skillPaths to the pi runner", () => {
    createRunner({
      runner: "pi",
      model: "gpt-5",
      userInput: "hi",
      cwd: "/tmp",
      autoInject: false,
      toolRefs,
      skillPaths: ["/tmp/skills/foo"],
    });

    expect(createPiRunner).toHaveBeenCalledTimes(1);
    const opts = createPiRunner.mock.calls[0][0];
    expect(opts.toolRefs).toEqual(toolRefs);
    expect(opts.skillPaths).toEqual(["/tmp/skills/foo"]);
    expect(piRun).toHaveBeenCalledWith("hi");
  });
});
