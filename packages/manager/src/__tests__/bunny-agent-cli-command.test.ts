import { describe, expect, it } from "vitest";
import { BunnyAgent } from "../bunny-agent.js";
import type { ExecOptions, SandboxAdapter, SandboxHandle } from "../types.js";

function createCapturingSandbox(captured: {
  command?: string[];
}): SandboxAdapter {
  const handle: SandboxHandle = {
    getSandboxId: () => null,
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec: (command: string[], _opts?: ExecOptions) => {
      captured.command = command;
      return (async function* () {})();
    },
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
  };

  return {
    attach: async () => handle,
    getHandle: () => handle,
    getWorkdir: () => "/workspace",
  };
}

describe("BunnyAgent CLI command construction: searchContractVersion", () => {
  it("adds --search-contract-version when set on the runner spec", async () => {
    const captured: { command?: string[] } = {};
    const agent = new BunnyAgent({
      sandbox: createCapturingSandbox(captured),
      runner: {
        model: "gpt-5",
        runnerType: "pi",
        searchContractVersion: 1,
      },
    });

    await agent.stream({ messages: [{ role: "user", content: "hi" }] });

    expect(captured.command).toContain("--search-contract-version");
    const idx = captured.command?.indexOf("--search-contract-version") ?? -1;
    expect(captured.command?.[idx + 1]).toBe("1");
  });

  it("omits --search-contract-version when unset (legacy unchanged)", async () => {
    const captured: { command?: string[] } = {};
    const agent = new BunnyAgent({
      sandbox: createCapturingSandbox(captured),
      runner: {
        model: "gpt-5",
        runnerType: "pi",
      },
    });

    await agent.stream({ messages: [{ role: "user", content: "hi" }] });

    expect(captured.command).not.toContain("--search-contract-version");
  });
});
