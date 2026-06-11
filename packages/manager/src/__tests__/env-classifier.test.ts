import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_ENV_FORCE_DENY,
  classifyEnv,
  isSystemEnvKey,
  parseSystemEnvKeysFromEnv,
} from "../env-classifier.js";

describe("isSystemEnvKey", () => {
  it("treats POSIX-standard keys as system", () => {
    expect(isSystemEnvKey("PATH")).toBe(true);
    expect(isSystemEnvKey("HOME")).toBe(true);
    expect(isSystemEnvKey("LANG")).toBe(true);
    expect(isSystemEnvKey("TZ")).toBe(true);
  });

  it("treats LC_*, XDG_*, BUNNY_* prefixes as system", () => {
    expect(isSystemEnvKey("LC_TIME")).toBe(true);
    expect(isSystemEnvKey("XDG_CONFIG_HOME")).toBe(true);
    expect(isSystemEnvKey("BUNNY_AGENT_WORKSPACE")).toBe(true);
  });

  it("treats unknown vendor keys as agent (not system)", () => {
    expect(isSystemEnvKey("MY_PRODUCT_KEY")).toBe(false);
    expect(isSystemEnvKey("BRAVE_API_KEY")).toBe(false);
    expect(isSystemEnvKey("TAVILY_API_KEY")).toBe(false);
    expect(isSystemEnvKey("IMAGE_GENERATION_MODEL")).toBe(false);
  });

  it("model-auth keys are agent even if extra whitelist asks for them", () => {
    const extra = new Set(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
    expect(isSystemEnvKey("ANTHROPIC_API_KEY", extra)).toBe(false);
    expect(isSystemEnvKey("OPENAI_API_KEY", extra)).toBe(false);
  });

  it("respects extraSystemKeys for non-deny keys", () => {
    const extra = new Set(["MY_INTERNAL_TOKEN"]);
    expect(isSystemEnvKey("MY_INTERNAL_TOKEN", extra)).toBe(true);
    expect(isSystemEnvKey("OTHER_TOKEN", extra)).toBe(false);
  });

  it("force-deny set covers the documented model auth keys", () => {
    for (const key of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "LITELLM_MASTER_KEY",
      "AWS_BEARER_TOKEN_BEDROCK",
    ]) {
      expect(AGENT_ENV_FORCE_DENY.has(key)).toBe(true);
    }
  });
});

describe("classifyEnv", () => {
  it("partitions a mixed env into system and agent", () => {
    const { system, agent } = classifyEnv({
      PATH: "/usr/bin",
      HOME: "/root",
      LANG: "en_US.UTF-8",
      OPENAI_API_KEY: "sk-abc",
      BRAVE_API_KEY: "bsk-1",
      MY_PRODUCT_KEY: "x",
      BUNNY_AGENT_WORKSPACE: "/workspace",
    });
    expect(system).toEqual({
      PATH: "/usr/bin",
      HOME: "/root",
      LANG: "en_US.UTF-8",
      BUNNY_AGENT_WORKSPACE: "/workspace",
    });
    expect(agent).toEqual({
      OPENAI_API_KEY: "sk-abc",
      BRAVE_API_KEY: "bsk-1",
      MY_PRODUCT_KEY: "x",
    });
  });

  it("drops null/undefined values", () => {
    const { system, agent } = classifyEnv({
      PATH: "/usr/bin",
      MISSING: undefined,
      EMPTY: null,
      OPENAI_API_KEY: "sk-abc",
    });
    expect(Object.keys(system)).toEqual(["PATH"]);
    expect(Object.keys(agent)).toEqual(["OPENAI_API_KEY"]);
  });

  it("extraSystemKeys promotes business keys to system", () => {
    const { system, agent } = classifyEnv(
      { MY_PRODUCT_KEY: "x", OTHER_KEY: "y" },
      { extraSystemKeys: ["MY_PRODUCT_KEY"] },
    );
    expect(system).toEqual({ MY_PRODUCT_KEY: "x" });
    expect(agent).toEqual({ OTHER_KEY: "y" });
  });

  it("extraSystemKeys cannot override the force-deny model auth set", () => {
    const { system, agent } = classifyEnv(
      { ANTHROPIC_API_KEY: "sk-y" },
      { extraSystemKeys: ["ANTHROPIC_API_KEY"] },
    );
    expect(system).toEqual({});
    expect(agent).toEqual({ ANTHROPIC_API_KEY: "sk-y" });
  });
});

describe("parseSystemEnvKeysFromEnv", () => {
  const original = process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS;
  afterEach(() => {
    if (original === undefined) delete process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS;
    else process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS = original;
  });

  it("returns empty set when var is missing", () => {
    delete process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS;
    expect(parseSystemEnvKeysFromEnv().size).toBe(0);
  });

  it("parses comma-separated keys, trimming whitespace and dropping empties", () => {
    process.env.BUNNY_AGENT_SYSTEM_ENV_KEYS = "  K1 , K2,, K3 ";
    const set = parseSystemEnvKeysFromEnv();
    expect(set).toEqual(new Set(["K1", "K2", "K3"]));
  });

  it("accepts an injected env map", () => {
    const set = parseSystemEnvKeysFromEnv({
      BUNNY_AGENT_SYSTEM_ENV_KEYS: "X,Y",
    });
    expect(set).toEqual(new Set(["X", "Y"]));
  });
});
