import { afterEach, describe, expect, it } from "vitest";
import { redactSecrets, resolveBashSpawnEnv } from "../tool-overrides.js";

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
// resolveBashSpawnEnv — security boundary that decides what enters bash
// ---------------------------------------------------------------------------

describe("resolveBashSpawnEnv", () => {
  const originalSysKeys = process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS;
  afterEach(() => {
    if (originalSysKeys === undefined)
      delete process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS;
    else process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS = originalSysKeys;
  });

  it("auto-classifies when systemEnv is undefined: business keys stay out", () => {
    const result = resolveBashSpawnEnv(
      {
        PATH: "/usr/bin",
        HOME: "/root",
        BRAVE_API_KEY: "bsk-1",
        TAVILY_API_KEY: "tvly-2",
        MY_PRODUCT_KEY: "x",
        ANTHROPIC_API_KEY: "sk-y",
      },
      undefined,
    );
    expect(result).toEqual({ PATH: "/usr/bin", HOME: "/root" });
  });

  it("respects explicit systemEnv when provided", () => {
    const result = resolveBashSpawnEnv(
      {
        PATH: "/usr/bin",
        BRAVE_API_KEY: "bsk-1",
        MY_PRODUCT_KEY: "x",
      },
      { PATH: "/usr/bin", MY_PRODUCT_KEY: "x" },
    );
    expect(result).toEqual({ PATH: "/usr/bin", MY_PRODUCT_KEY: "x" });
    expect(result.BRAVE_API_KEY).toBeUndefined();
  });

  it("strips model auth keys even when caller adds them to systemEnv", () => {
    const result = resolveBashSpawnEnv(
      {},
      {
        PATH: "/usr/bin",
        ANTHROPIC_API_KEY: "sk-y",
        OPENAI_API_KEY: "sk-z",
      },
    );
    expect(result).toEqual({ PATH: "/usr/bin" });
  });

  it("BUNNY_AGENT_SYSTEM_ENV_KEYS extends the auto-classify whitelist", () => {
    process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS = "MY_PRODUCT_KEY";
    const result = resolveBashSpawnEnv(
      {
        PATH: "/usr/bin",
        MY_PRODUCT_KEY: "x",
        OTHER_KEY: "y",
      },
      undefined,
    );
    expect(result).toEqual({
      PATH: "/usr/bin",
      MY_PRODUCT_KEY: "x",
    });
  });

  it("BUNNY_AGENT_SYSTEM_ENV_KEYS cannot promote model auth keys", () => {
    process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS = "ANTHROPIC_API_KEY";
    const result = resolveBashSpawnEnv(
      {
        PATH: "/usr/bin",
        ANTHROPIC_API_KEY: "sk-y",
      },
      undefined,
    );
    expect(result).toEqual({ PATH: "/usr/bin" });
  });
});
