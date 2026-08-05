import type { AgentTurnInputV1 } from "@bunny-agent/manager";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRunner } from "../runner.js";

type RunnerOptions = Record<string, unknown>;

const claudeRun = vi.fn((_input: unknown) => (async function* () {})());
const createClaudeRunner = vi.fn((_options: RunnerOptions) => ({
  run: claudeRun,
}));
const piRun = vi.fn((_input: unknown) => (async function* () {})());
const createPiRunner = vi.fn((_options: RunnerOptions) => ({ run: piRun }));

vi.mock("@bunny-agent/runner-claude", () => ({
  createClaudeRunner: (options: RunnerOptions) => createClaudeRunner(options),
}));
vi.mock("@bunny-agent/runner-pi", () => ({
  createPiRunner: (options: RunnerOptions) => createPiRunner(options),
}));
vi.mock("@bunny-agent/runner-codex", () => ({ createCodexRunner: vi.fn() }));
vi.mock("@bunny-agent/runner-copilot", () => ({
  createCopilotRunner: vi.fn(),
}));
vi.mock("@bunny-agent/runner-gemini", () => ({ createGeminiRunner: vi.fn() }));
vi.mock("@bunny-agent/runner-opencode", () => ({
  createOpenCodeRunner: vi.fn(),
}));

describe("createRunner dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes structured image input to Claude and Pi without stringifying", () => {
    const input: AgentTurnInputV1 = {
      version: 1,
      input: [
        {
          type: "asset",
          id: "asset-1",
          label: "[Image #1]",
          asset: { mediaType: "image/png", data: "aW1hZ2U=" },
        },
        { type: "text", text: "Inspect [Image #1]" },
      ],
      capabilities: [],
      execution: { resolvedBy: "server" },
    };

    createRunner({
      runner: "claude",
      model: "claude-sonnet-4-20250514",
      input,
      cwd: "/tmp",
      autoInject: false,
    });
    createRunner({
      runner: "pi",
      model: "gpt-5",
      input,
      cwd: "/tmp",
      autoInject: false,
    });

    expect(claudeRun).toHaveBeenCalledWith(input);
    expect(piRun).toHaveBeenCalledWith(input);
  });
});
