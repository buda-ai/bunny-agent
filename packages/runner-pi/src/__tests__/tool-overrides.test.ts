import { describe, expect, it, vi } from "vitest";
import {
  buildEnvInjectedBashTool,
  buildSecretAwareTools,
  buildSecretRedactingReadTool,
  redactSecrets,
} from "../tool-overrides.js";

const piMocks = vi.hoisted(() => ({
  bashExecute: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "token sk-abcdefgh1234" }],
    details: {},
  }),
  readExecute: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "secret sk-abcdefgh1234" }],
    details: {},
  }),
  spawnHook: undefined as
    | undefined
    | ((ctx: { env: Record<string, string> }) => unknown),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createBashTool: vi.fn((_cwd, options) => {
    piMocks.spawnHook = options.spawnHook;
    return {
      name: "bash",
      label: "bash",
      description: "bash",
      parameters: {},
      execute: piMocks.bashExecute,
    };
  }),
  createReadTool: vi.fn(() => ({
    name: "read",
    label: "read",
    description: "read",
    parameters: {},
    execute: piMocks.readExecute,
  })),
}));

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

describe("buildSecretAwareTools", () => {
  it("always includes bash/read/web_fetch and adds web_search only when configured", () => {
    expect(
      buildSecretAwareTools("/tmp/project", {}).map((tool) => tool.name),
    ).toEqual(["bash", "read", "web_fetch"]);

    expect(
      buildSecretAwareTools("/tmp/project", { BRAVE_API_KEY: "bsk-test" }).map(
        (tool) => tool.name,
      ),
    ).toEqual(["bash", "read", "web_fetch", "web_search"]);
  });
});

describe("tool override execution", () => {
  it("injects env, blocks env dump commands, and redacts bash output", async () => {
    const tool = buildEnvInjectedBashTool("/tmp/project", {
      OPENAI_API_KEY: "sk-abcdefgh1234",
    });

    expect(piMocks.spawnHook?.({ env: { PATH: "/usr/bin" } })).toEqual({
      env: { PATH: "/usr/bin", OPENAI_API_KEY: "sk-abcdefgh1234" },
    });

    const blocked = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )("call_1", { command: "echo ok && printenv" }, undefined, undefined);
    expect(blocked.content[0]?.text).toContain("Command blocked");

    const allowed = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )("call_2", { command: "echo ok" }, undefined, undefined);
    expect(allowed.content[0]?.text).toBe("token ***");
  });

  it("redacts read tool output", async () => {
    const tool = buildSecretRedactingReadTool("/tmp/project", {
      OPENAI_API_KEY: "sk-abcdefgh1234",
    });

    const result = await (
      tool.execute as (...args: unknown[]) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>
    )("call_1", { path: ".env" }, undefined, undefined);

    expect(result.content[0]?.text).toBe("secret ***");
  });
});
