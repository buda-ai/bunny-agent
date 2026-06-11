import { describe, expect, it, vi } from "vitest";
import { redactSecrets } from "../tool-overrides.js";

// ---------------------------------------------------------------------------
// redactSecrets
// ---------------------------------------------------------------------------

describe("redactSecrets", () => {
  it("returns text unchanged when secrets map is empty", () => {
    expect(redactSecrets("hello world", {})).toBe("hello world");
  });

  it("scrubs bare secret value occurrences", () => {
    const result = redactSecrets("token is sk-abcdefgh1234", {
      API_KEY: "sk-abcdefgh1234",
    });
    expect(result).toBe("token is ***");
  });

  it("removes KEY=VALUE lines by key name", () => {
    const text = "PATH=/usr/bin\nOPENAI_API_KEY=sk-abcdefgh1234\nHOME=/root";
    const result = redactSecrets(text, { OPENAI_API_KEY: "sk-abcdefgh1234" });
    expect(result).not.toContain("OPENAI_API_KEY");
    expect(result).toContain("PATH=/usr/bin");
    expect(result).toContain("HOME=/root");
  });

  it("removes JSON object entries by key name", () => {
    const text = `{\n  "OPENAI_API_KEY": "sk-abcdefgh1234",\n  "other": "value"\n}`;
    const result = redactSecrets(text, { OPENAI_API_KEY: "sk-abcdefgh1234" });
    expect(result).not.toContain("OPENAI_API_KEY");
    expect(result).toContain("other");
  });

  it("ignores values shorter than 8 characters", () => {
    const result = redactSecrets("value is abc", { SHORT: "abc" });
    expect(result).toBe("value is abc");
  });

  it("does not redact Unix filesystem paths", () => {
    const text = "working dir is /agent/workspace";
    const result = redactSecrets(text, {
      BUNNY_AGENT_WORKSPACE: "/agent/workspace",
    });
    expect(result).toBe("working dir is /agent/workspace");
  });

  it("does not redact Windows filesystem paths", () => {
    const text = "working dir is C:\\Users\\agent";
    const result = redactSecrets(text, { WORKSPACE: "C:\\Users\\agent" });
    expect(result).toBe("working dir is C:\\Users\\agent");
  });

  it("handles multiple secrets, scrubbing all", () => {
    const text = "key1=sk-abcdefgh1234 and key2=ghp-xyzxyzxyzxyz";
    const result = redactSecrets(text, {
      OPENAI_KEY: "sk-abcdefgh1234",
      GITHUB_TOKEN: "ghp-xyzxyzxyzxyz",
    });
    expect(result).not.toContain("sk-abcdefgh1234");
    expect(result).not.toContain("ghp-xyzxyzxyzxyz");
  });

  it("collapses excessive blank lines", () => {
    const text = "line1\n\n\n\n\nline2";
    // needs at least one secret to pass through the full function body
    const result = redactSecrets(text, { DUMMY_SECRET: "notpresent_here" });
    expect(result).toBe("line1\n\nline2");
  });

  it("handles env dump output — removes secret lines, keeps others", () => {
    const text = [
      "TERM=xterm-256color",
      "OPENAI_API_KEY=sk-abcdefgh1234",
      "HOME=/root",
      "GEMINI_API_KEY=AIzaSyAbcdefghij",
    ].join("\n");

    const result = redactSecrets(text, {
      OPENAI_API_KEY: "sk-abcdefgh1234",
      GEMINI_API_KEY: "AIzaSyAbcdefghij",
    });

    expect(result).not.toContain("OPENAI_API_KEY");
    expect(result).not.toContain("GEMINI_API_KEY");
    expect(result).toContain("TERM=xterm-256color");
    expect(result).toContain("HOME=/root");
  });
});

// ---------------------------------------------------------------------------
// buildEnvInjectedBashTool — caller-declared systemEnv only
// ---------------------------------------------------------------------------

// Capture spawnHook input + output so we can assert what reaches bash.
type SpawnHook = (ctx: {
  env: Record<string, string>;
  command?: string;
}) => { env: Record<string, string> };

let capturedSpawnHook: SpawnHook | null = null;

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createBashTool: vi.fn((_cwd: string, opts: { spawnHook: SpawnHook }) => {
    capturedSpawnHook = opts.spawnHook;
    return {
      name: "bash",
      label: "bash",
      description: "stub",
      parameters: { type: "object", properties: {}, required: [] },
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "ok" }],
        details: undefined,
      }),
    };
  }),
  createReadTool: vi.fn(() => ({
    name: "read",
    label: "read",
    description: "stub",
    parameters: { type: "object", properties: {}, required: [] },
    execute: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "" }],
      details: undefined,
    }),
  })),
}));

describe("buildEnvInjectedBashTool spawnHook", () => {
  async function build(
    extraEnv: Record<string, string>,
    systemEnv?: Record<string, string>,
  ): Promise<SpawnHook> {
    capturedSpawnHook = null;
    const { buildEnvInjectedBashTool } = await import("../tool-overrides.js");
    buildEnvInjectedBashTool(
      "/tmp",
      extraEnv,
      systemEnv ? { systemEnv } : {},
    );
    const hook = capturedSpawnHook as SpawnHook | null;
    if (hook == null) throw new Error("spawnHook was not registered");
    return hook;
  }

  it("injects nothing extra when systemEnv is omitted", async () => {
    const hook = await build({
      ANTHROPIC_API_KEY: "sk-y",
      MY_PRODUCT_KEY: "x",
    });
    const { env } = hook({ env: { PATH: "/usr/bin", HOME: "/root" } });
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/root" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.MY_PRODUCT_KEY).toBeUndefined();
  });

  it("injects exactly the keys in systemEnv (daemon use case)", async () => {
    const hook = await build(
      {
        ANTHROPIC_API_KEY: "sk-y",
        BRAVE_API_KEY: "bsk-1",
        TAVILY_API_KEY: "tvly-2",
        MY_PRODUCT_KEY: "x",
      },
      { MY_PRODUCT_KEY: "x" },
    );
    const { env } = hook({ env: { PATH: "/usr/bin" } });
    expect(env).toEqual({ PATH: "/usr/bin", MY_PRODUCT_KEY: "x" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.BRAVE_API_KEY).toBeUndefined();
    expect(env.TAVILY_API_KEY).toBeUndefined();
  });

  it("no policy: a key declared in systemEnv reaches bash even if it looks like an auth key", async () => {
    // The runner has zero opinion on what counts as "system" — caller's
    // responsibility. Pinned by this test so a future regression that
    // re-adds a blocklist gets caught.
    const hook = await build(
      { ANTHROPIC_API_KEY: "sk-y" },
      { ANTHROPIC_API_KEY: "sk-y" },
    );
    const { env } = hook({ env: { PATH: "/usr/bin" } });
    expect(env.ANTHROPIC_API_KEY).toBe("sk-y");
  });

  it("ctx.env is preserved (default OS env still reaches bash)", async () => {
    const hook = await build({}, { MY_KEY: "v" });
    const { env } = hook({
      env: { PATH: "/usr/bin", HOME: "/root", LANG: "en_US.UTF-8" },
    });
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/root");
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(env.MY_KEY).toBe("v");
  });

  it("systemEnv overrides ctx.env on key collision", async () => {
    const hook = await build({}, { PATH: "/custom/bin" });
    const { env } = hook({ env: { PATH: "/usr/bin" } });
    expect(env.PATH).toBe("/custom/bin");
  });
});
