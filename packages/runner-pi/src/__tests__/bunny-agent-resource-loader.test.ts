import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  delegate: {
    reload: vi.fn().mockResolvedValue(undefined),
    getExtensions: vi.fn().mockReturnValue({ extensions: ["ext"] }),
    getPrompts: vi.fn().mockReturnValue({ prompts: [], diagnostics: [] }),
    getThemes: vi.fn().mockReturnValue({ themes: [], diagnostics: [] }),
    getAgentsFiles: vi.fn().mockReturnValue({ agentsFiles: [] }),
    getSystemPrompt: vi.fn().mockReturnValue("system"),
    getAppendSystemPrompt: vi.fn().mockReturnValue(["base"]),
    extendResources: vi.fn(),
  },
  loadSkills: vi
    .fn()
    .mockReturnValue({ skills: [{ name: "skill" }], diagnostics: [] }),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  DefaultResourceLoader: vi.fn().mockImplementation(() => mocks.delegate),
  loadSkills: mocks.loadSkills,
}));

vi.mock("../bundled-extensions/bunny-pi-extension.js", () => ({
  createBunnyPiExtension: vi.fn().mockReturnValue({ name: "bunny" }),
}));

describe("BunnyAgentResourceLoader", () => {
  it("loads skills once, delegates resources, appends extra prompt, and clears cache on reload", async () => {
    const { BunnyAgentResourceLoader } = await import(
      "../bunny-agent-resource-loader.js"
    );
    const loader = new BunnyAgentResourceLoader({
      cwd: "/tmp/project",
      agentDir: "/tmp/agent",
      skillPaths: [],
      appendSystemPrompt: "extra",
      permissionMode: "safe",
    });

    expect(loader.getSkills().skills).toEqual([{ name: "skill" }]);
    expect(loader.getSkills().skills).toEqual([{ name: "skill" }]);
    expect(mocks.loadSkills).toHaveBeenCalledTimes(1);

    expect(loader.getExtensions()).toEqual({ extensions: ["ext"] });
    expect(loader.getPrompts()).toEqual({ prompts: [], diagnostics: [] });
    expect(loader.getThemes()).toEqual({ themes: [], diagnostics: [] });
    expect(loader.getAgentsFiles()).toEqual({ agentsFiles: [] });
    expect(loader.getSystemPrompt()).toBe("system");
    expect(loader.getAppendSystemPrompt()).toEqual(["base", "extra"]);

    (loader.extendResources as unknown as (paths: string[]) => void)([
      "/tmp/extra",
    ]);
    expect(mocks.delegate.extendResources).toHaveBeenCalledWith(["/tmp/extra"]);

    await loader.reload();
    expect(mocks.delegate.reload).toHaveBeenCalled();
    loader.getSkills();
    expect(mocks.loadSkills).toHaveBeenCalledTimes(2);
  });
});
