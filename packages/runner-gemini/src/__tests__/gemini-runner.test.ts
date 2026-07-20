import { describe, expect, it, vi } from "vitest";

const createAcpProcessRunner = vi.hoisted(() =>
  vi.fn().mockReturnValue({ run: vi.fn(), abort: vi.fn() }),
);

vi.mock("@bunny-agent/runner-acp", () => ({ createAcpProcessRunner }));

import { createGeminiRunner } from "../gemini-runner.js";

describe("createGeminiRunner", () => {
  it("configures the Gemini ACP subprocess", () => {
    const abortController = new AbortController();
    createGeminiRunner({
      model: "gemini-2.5-pro",
      cwd: "/tmp/project",
      env: { GEMINI_API_KEY: "test" },
      abortController,
      systemPrompt: "Follow instructions",
      yolo: true,
    });

    expect(createAcpProcessRunner).toHaveBeenCalledWith({
      displayName: "Gemini",
      command: "gemini",
      args: ["--experimental-acp", "--model", "gemini-2.5-pro"],
      cwd: "/tmp/project",
      env: { GEMINI_API_KEY: "test" },
      abortController,
      systemPrompt: "Follow instructions",
      yolo: true,
    });
  });
});
