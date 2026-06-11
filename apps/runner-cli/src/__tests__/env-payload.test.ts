import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takeToolRefsFromEnv } from "../env-payload.js";

describe("takeToolRefsFromEnv", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null and leaves env untouched when var is absent", () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(takeToolRefsFromEnv(env)).toBeNull();
    expect(env.BUNNY_AGENT_TOOL_REFS_JSON).toBeUndefined();
  });

  it("parses payload and unsets the var atomically (read+delete)", () => {
    const env = {
      BUNNY_AGENT_TOOL_REFS_JSON: JSON.stringify({
        tools: [
          {
            name: "x",
            description: "",
            inputSchema: {},
            runtime: { type: "http", url: "http://x" },
          },
        ],
      }),
    } as NodeJS.ProcessEnv;

    const result = takeToolRefsFromEnv(env);
    expect(result?.tools).toHaveLength(1);
    expect(env.BUNNY_AGENT_TOOL_REFS_JSON).toBeUndefined();
  });

  it("unsets the var even when JSON is invalid (no leak via env inheritance)", () => {
    const env = {
      BUNNY_AGENT_TOOL_REFS_JSON: "not-json{",
    } as NodeJS.ProcessEnv;

    expect(takeToolRefsFromEnv(env)).toBeNull();
    expect(env.BUNNY_AGENT_TOOL_REFS_JSON).toBeUndefined();
  });

  it("returns null and unsets when payload lacks tools array", () => {
    const env = {
      BUNNY_AGENT_TOOL_REFS_JSON: '{"tools":"not-an-array"}',
    } as NodeJS.ProcessEnv;

    expect(takeToolRefsFromEnv(env)).toBeNull();
    expect(env.BUNNY_AGENT_TOOL_REFS_JSON).toBeUndefined();
  });

  it("each take is one-shot — second call returns null", () => {
    const env = {
      BUNNY_AGENT_TOOL_REFS_JSON: JSON.stringify({ tools: [] }),
    } as NodeJS.ProcessEnv;

    expect(takeToolRefsFromEnv(env)).toEqual({ tools: [] });
    expect(takeToolRefsFromEnv(env)).toBeNull();
  });
});
