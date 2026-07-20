import { describe, expect, it, vi } from "vitest";

const createAcpProcessRunner = vi.hoisted(() =>
  vi.fn().mockReturnValue({ run: vi.fn(), abort: vi.fn() }),
);

vi.mock("@bunny-agent/runner-acp", () => ({ createAcpProcessRunner }));

import { createOpenCodeRunner } from "../opencode-runner.js";

describe("createOpenCodeRunner", () => {
  it("configures the OpenCode ACP subprocess", () => {
    createOpenCodeRunner({ model: "openai/gpt-5.4", yolo: false });

    expect(createAcpProcessRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "OpenCode",
        command: "opencode",
        args: ["acp", "--model", "openai/gpt-5.4"],
        yolo: false,
      }),
    );
  });
});
