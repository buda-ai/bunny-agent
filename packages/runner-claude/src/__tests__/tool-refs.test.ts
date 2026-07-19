import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMcpToolDefinitionsFromRefs,
  type ClaudeToolRef,
  jsonSchemaToZodShape,
  TOOL_REF_MCP_SERVER_NAME,
  toolRefMcpToolName,
} from "../tool-refs.js";

const httpRef: ClaudeToolRef = {
  name: "get_weather",
  description: "Get the weather",
  inputSchema: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
      days: { type: "integer" },
    },
    required: ["city"],
  },
  runtime: { type: "http", url: "https://example.com/tool" },
};

describe("toolRefMcpToolName", () => {
  it("uses the mcp__<server>__<tool> convention", () => {
    expect(toolRefMcpToolName("get_weather")).toBe(
      `mcp__${TOOL_REF_MCP_SERVER_NAME}__get_weather`,
    );
  });
});

describe("jsonSchemaToZodShape", () => {
  it("maps typed properties and required-ness", () => {
    const shape = jsonSchemaToZodShape(httpRef.inputSchema);
    expect(Object.keys(shape)).toEqual(["city", "days"]);
    expect(shape.city.safeParse("Berlin").success).toBe(true);
    expect(shape.city.safeParse(42).success).toBe(false);
    // required prop is not optional
    expect(shape.city.safeParse(undefined).success).toBe(false);
    // optional prop accepts undefined
    expect(shape.days.safeParse(undefined).success).toBe(true);
    expect(shape.days.safeParse(3).success).toBe(true);
  });

  it("handles schemas without properties", () => {
    expect(jsonSchemaToZodShape({ type: "object" })).toEqual({});
  });
});

describe("buildMcpToolDefinitionsFromRefs", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("converts refs preserving name and description", () => {
    const [def] = buildMcpToolDefinitionsFromRefs([httpRef]);
    expect(def.name).toBe("get_weather");
    expect(def.description).toBe("Get the weather");
    expect(typeof def.handler).toBe("function");
  });

  it("executes http runtime via POST with JSON body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("sunny", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const [def] = buildMcpToolDefinitionsFromRefs([httpRef]);
    const result = await def.handler({ city: "Berlin" }, {});

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/tool",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ city: "Berlin" }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(result).toEqual({
      content: [{ type: "text", text: "sunny" }],
    });
  });

  it("returns isError result on non-2xx http status", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("boom", { status: 500 }),
      ) as unknown as typeof fetch;

    const [def] = buildMcpToolDefinitionsFromRefs([httpRef]);
    const result = await def.handler({ city: "Berlin" }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("boom");
  });

  it("returns isError result on transport failure", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const [def] = buildMcpToolDefinitionsFromRefs([httpRef]);
    const result = await def.handler({ city: "Berlin" }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("network down");
    expect(result.content[0].text).toContain("get_weather");
  });

  it("executes module runtime via dynamic import", async () => {
    const moduleRef: ClaudeToolRef = {
      name: "adder",
      description: "Adds numbers",
      inputSchema: { type: "object", properties: {} },
      runtime: {
        type: "module",
        module: new URL("./fixtures/module-tool.mjs", import.meta.url).href,
        exportName: "add",
      },
    };
    const [def] = buildMcpToolDefinitionsFromRefs([moduleRef]);
    const result = await def.handler({ a: 1, b: 2 }, {});
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ sum: 3 }) }],
    });
  });

  it("returns isError when module export is not a function", async () => {
    const moduleRef: ClaudeToolRef = {
      name: "broken",
      description: "Broken tool",
      inputSchema: { type: "object", properties: {} },
      runtime: {
        type: "module",
        module: new URL("./fixtures/module-tool.mjs", import.meta.url).href,
        exportName: "missing",
      },
    };
    const [def] = buildMcpToolDefinitionsFromRefs([moduleRef]);
    const result = await def.handler({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("missing");
  });
});
