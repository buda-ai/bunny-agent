import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  takeAgentInputFromEnv,
  takeMcpConfigFromEnv,
  takeToolRefsFromEnv,
} from "../env-payload.js";

describe("takeAgentInputFromEnv", () => {
  it("validates and deletes the one-shot structured payload", () => {
    const env = {
      BUNNY_AGENT_INPUT_JSON: JSON.stringify({
        version: 1,
        input: [{ type: "text", text: "hello" }],
        capabilities: [],
        execution: {},
      }),
    };

    expect(takeAgentInputFromEnv(env)).toMatchObject({ version: 1 });
    expect(env.BUNNY_AGENT_INPUT_JSON).toBeUndefined();
  });

  it("deletes malformed payloads before throwing", () => {
    const env = { BUNNY_AGENT_INPUT_JSON: "not-json" };
    expect(() => takeAgentInputFromEnv(env)).toThrow();
    expect(env.BUNNY_AGENT_INPUT_JSON).toBeUndefined();
  });
});

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

describe("takeMcpConfigFromEnv", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses and removes a request-scoped MCP config", () => {
    const env = {
      BUNNY_AGENT_MCP_CONFIG_JSON: JSON.stringify({
        config: {
          mcpServers: {
            remote: {
              url: "https://mcp.example.com",
              auth: "bearer",
              bearerToken: "secret",
            },
          },
        },
      }),
    } as NodeJS.ProcessEnv;

    expect(takeMcpConfigFromEnv(env)?.config).toMatchObject({
      mcpServers: {
        remote: { bearerToken: "secret" },
      },
    });
    expect(env.BUNNY_AGENT_MCP_CONFIG_JSON).toBeUndefined();
  });

  it("removes malformed payloads before returning", () => {
    const env = {
      BUNNY_AGENT_MCP_CONFIG_JSON: "{not-json",
    } as NodeJS.ProcessEnv;

    expect(takeMcpConfigFromEnv(env)).toBeNull();
    expect(env.BUNNY_AGENT_MCP_CONFIG_JSON).toBeUndefined();
  });

  it("removes an empty payload before returning", () => {
    const env = {
      BUNNY_AGENT_MCP_CONFIG_JSON: "",
    } as NodeJS.ProcessEnv;

    expect(takeMcpConfigFromEnv(env)).toBeNull();
    expect(env.BUNNY_AGENT_MCP_CONFIG_JSON).toBeUndefined();
  });

  it("is one-shot", () => {
    const env = {
      BUNNY_AGENT_MCP_CONFIG_JSON: JSON.stringify({
        config: { mcpServers: {} },
      }),
    } as NodeJS.ProcessEnv;

    expect(takeMcpConfigFromEnv(env)).not.toBeNull();
    expect(takeMcpConfigFromEnv(env)).toBeNull();
  });
});
