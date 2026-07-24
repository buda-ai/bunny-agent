import { describe, expect, it, vi } from "vitest";

const createCopilotRunner = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    run: vi.fn().mockImplementation(async function* () {
      yield "data: [DONE]\n\n";
    }),
  }),
);
const createPiRunner = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    run: vi.fn().mockImplementation(async function* () {
      yield "data: [DONE]\n\n";
    }),
  }),
);

vi.mock("@bunny-agent/runner-claude", () => ({ createClaudeRunner: vi.fn() }));
vi.mock("@bunny-agent/runner-codex", () => ({ createCodexRunner: vi.fn() }));
vi.mock("@bunny-agent/runner-copilot", () => ({ createCopilotRunner }));
vi.mock("@bunny-agent/runner-gemini", () => ({ createGeminiRunner: vi.fn() }));
vi.mock("@bunny-agent/runner-opencode", () => ({
  createOpenCodeRunner: vi.fn(),
}));
vi.mock("@bunny-agent/runner-pi", () => ({ createPiRunner }));

import { createRunner } from "./runner.js";

describe("createRunner", () => {
  it("dispatches Copilot with shared runner options", async () => {
    const abortController = new AbortController();
    const chunks: string[] = [];
    for await (const chunk of createRunner({
      runner: "copilot",
      model: "gpt-5",
      userInput: "Implement it",
      systemPrompt: "Follow project rules",
      allowedTools: ["shell"],
      resume: "copilot-session",
      yolo: true,
      effort: "high",
      cwd: "/tmp/project",
      env: { GITHUB_TOKEN: "test" },
      abortController,
      autoInject: false,
    })) {
      chunks.push(chunk);
    }

    expect(createCopilotRunner).toHaveBeenCalledWith({
      model: "gpt-5",
      systemPrompt: "Follow project rules",
      allowedTools: ["shell"],
      resume: "copilot-session",
      yolo: true,
      reasoningEffort: "high",
      cwd: "/tmp/project",
      env: { GITHUB_TOKEN: "test" },
      abortController,
    });
    expect(chunks).toEqual(["data: [DONE]\n\n"]);
  });

  it("forwards the missing-session transcript fallback only to Pi", async () => {
    for await (const _ of createRunner({
      runner: "pi",
      model: "openai:gpt-5",
      userInput: "continue",
      resumeFallbackUserInput: "full transcript",
      resume: "pi-session",
      cwd: "/tmp/project",
      autoInject: false,
    })) {
      // consume stream
    }

    expect(createPiRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "pi-session",
        resumeFallbackUserInput: "full transcript",
      }),
    );
  });
});
