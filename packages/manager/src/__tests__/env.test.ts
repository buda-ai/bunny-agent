import { afterEach, describe, expect, it } from "vitest";
import { buildRunnerEnv } from "../env.js";

describe("buildRunnerEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("includes BRAVE_API_KEY from params", () => {
    const env = buildRunnerEnv({ BRAVE_API_KEY: "bsk-123" });
    expect(env.BRAVE_API_KEY).toBe("bsk-123");
  });

  it("includes TAVILY_API_KEY from params", () => {
    const env = buildRunnerEnv({ TAVILY_API_KEY: "tvly-456" });
    expect(env.TAVILY_API_KEY).toBe("tvly-456");
  });

  it("falls back to process.env for BRAVE_API_KEY", () => {
    process.env.BRAVE_API_KEY = "env-brave";
    const env = buildRunnerEnv({});
    expect(env.BRAVE_API_KEY).toBe("env-brave");
  });

  it("falls back to process.env for TAVILY_API_KEY", () => {
    process.env.TAVILY_API_KEY = "env-tavily";
    const env = buildRunnerEnv({});
    expect(env.TAVILY_API_KEY).toBe("env-tavily");
  });

  it("params override process.env for web search keys", () => {
    process.env.BRAVE_API_KEY = "env-brave";
    const env = buildRunnerEnv({ BRAVE_API_KEY: "param-brave" });
    expect(env.BRAVE_API_KEY).toBe("param-brave");
  });

  it("omits web search keys when neither params nor process.env has them", () => {
    delete process.env.BRAVE_API_KEY;
    delete process.env.TAVILY_API_KEY;
    const env = buildRunnerEnv({});
    expect(env.BRAVE_API_KEY).toBeUndefined();
    expect(env.TAVILY_API_KEY).toBeUndefined();
  });

  it("includes both web search keys alongside runner-specific keys", () => {
    const env = buildRunnerEnv({
      runnerType: "pi",
      OPENAI_API_KEY: "sk-openai",
      BRAVE_API_KEY: "bsk-brave",
      TAVILY_API_KEY: "tvly-tavily",
    });
    expect(env.OPENAI_API_KEY).toBe("sk-openai");
    expect(env.BRAVE_API_KEY).toBe("bsk-brave");
    expect(env.TAVILY_API_KEY).toBe("tvly-tavily");
  });

  it("includes IMAGE_GENERATION_MODEL from params", () => {
    const env = buildRunnerEnv({
      IMAGE_GENERATION_MODEL: "openai:gpt-image-1",
    });
    expect(env.IMAGE_GENERATION_MODEL).toBe("openai:gpt-image-1");
  });

  it("falls back to process.env for IMAGE_GENERATION_MODEL", () => {
    process.env.IMAGE_GENERATION_MODEL = "openai:dall-e-3";
    const env = buildRunnerEnv({});
    expect(env.IMAGE_GENERATION_MODEL).toBe("openai:dall-e-3");
  });

  it("params override process.env for IMAGE_GENERATION_MODEL", () => {
    process.env.IMAGE_GENERATION_MODEL = "openai:dall-e-3";
    const env = buildRunnerEnv({
      IMAGE_GENERATION_MODEL: "openai:gpt-image-1",
    });
    expect(env.IMAGE_GENERATION_MODEL).toBe("openai:gpt-image-1");
  });

  it("omits IMAGE_GENERATION_MODEL when neither params nor process.env has it", () => {
    delete process.env.IMAGE_GENERATION_MODEL;
    const env = buildRunnerEnv({});
    expect(env.IMAGE_GENERATION_MODEL).toBeUndefined();
  });

  it("includes IMAGE_GENERATION_MODEL alongside runner-specific keys", () => {
    const env = buildRunnerEnv({
      runnerType: "pi",
      OPENAI_API_KEY: "sk-openai",
      IMAGE_GENERATION_MODEL: "openai:gpt-image-1",
    });
    expect(env.OPENAI_API_KEY).toBe("sk-openai");
    expect(env.IMAGE_GENERATION_MODEL).toBe("openai:gpt-image-1");
  });
});
