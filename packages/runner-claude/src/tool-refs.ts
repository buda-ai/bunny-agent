/**
 * Serializable tool refs for the Claude runner.
 *
 * Tool refs describe external tools (HTTP endpoints or local modules) in a
 * JSON-serializable form. They are converted into in-process MCP tool
 * definitions and exposed to the Claude Agent SDK through an SDK-transport
 * MCP server (`createSdkMcpServer`), so tool calls execute inside the runner
 * process.
 *
 * The shape is structurally compatible with `PiToolRef` from
 * `@bunny-agent/runner-pi` (deliberately re-declared here so the packages
 * stay decoupled), and the execution semantics mirror pi's `tool-refs.ts`.
 */
import { z } from "zod";

/** Where and how a tool ref executes. */
export type ClaudeToolRuntime =
  | {
      type: "http";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      type: "module";
      module: string;
      exportName?: string;
    };

/** Serializable description of a custom tool. */
export interface ClaudeToolRef {
  name: string;
  description: string;
  /** JSON Schema (object schema) describing the tool input. */
  inputSchema: Record<string, unknown>;
  runtime: ClaudeToolRuntime;
}

/** Name of the in-process MCP server that hosts tool refs. */
export const TOOL_REF_MCP_SERVER_NAME = "bunny-tools";

/**
 * MCP tool name as seen by the Claude Agent SDK
 * (`mcp__<serverName>__<toolName>`), for use in `allowedTools`.
 */
export function toolRefMcpToolName(refName: string): string {
  return `mcp__${TOOL_REF_MCP_SERVER_NAME}__${refName}`;
}

type RuntimeResponse = { status: number; body: string };

/**
 * Minimal structural shape of the SDK's `SdkMcpToolDefinition` /
 * `CallToolResult` so this module stays importable without the SDK.
 */
export interface ClaudeMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodType>;
  handler: (
    args: Record<string, unknown>,
    extra: unknown,
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}

/**
 * Convert serializable tool refs into SDK MCP tool definitions suitable for
 * `createSdkMcpServer({ tools })`.
 */
export function buildMcpToolDefinitionsFromRefs(
  refs: ClaudeToolRef[],
): ClaudeMcpToolDefinition[] {
  return refs.map((ref) => buildOne(ref));
}

function buildOne(ref: ClaudeToolRef): ClaudeMcpToolDefinition {
  return {
    name: ref.name,
    description: ref.description,
    inputSchema: jsonSchemaToZodShape(ref.inputSchema),
    async handler(args) {
      let response: RuntimeResponse;
      try {
        response = await executeToolRef(ref, args, undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Tool "${ref.name}" transport error: ${message}`);
      }
      if (response.status < 200 || response.status >= 300) {
        const body = response.body.trim();
        return errorResult(
          body.length > 0
            ? body
            : `Tool execution failed with status ${response.status}`,
        );
      }
      return { content: [{ type: "text", text: response.body }] };
    },
  };
}

/**
 * Best-effort conversion of a JSON Schema object into a Zod raw shape.
 *
 * The SDK's `tool()` / `SdkMcpToolDefinition` only accept Zod raw shapes
 * (sdk.d.ts: `inputSchema: Schema extends AnyZodRawShape`), not raw JSON
 * Schema, so top-level properties are mapped to loose Zod types. Property
 * descriptions and required-ness are preserved; nested constraints are left
 * to the runtime endpoint to validate (mirroring pi, which also skips local
 * validation via `Type.Unsafe`).
 */
export function jsonSchemaToZodShape(
  schema: Record<string, unknown>,
): Record<string, z.ZodType> {
  const properties =
    (schema.properties as Record<string, Record<string, unknown>>) ?? {};
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );

  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(properties)) {
    let type = zodTypeForJsonType(prop?.type);
    if (typeof prop?.description === "string") {
      type = type.describe(prop.description);
    }
    shape[key] = required.has(key) ? type : type.optional();
  }
  return shape;
}

function zodTypeForJsonType(jsonType: unknown): z.ZodType {
  switch (jsonType) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(z.unknown());
    case "object":
      return z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

async function executeToolRef(
  ref: ClaudeToolRef,
  params: unknown,
  signal: AbortSignal | undefined,
): Promise<RuntimeResponse> {
  switch (ref.runtime.type) {
    case "http":
      return sendDirectHttpRequest(ref.runtime, params, signal);
    case "module":
      return executeModuleTool(ref.runtime, params, signal);
  }
}

async function sendDirectHttpRequest(
  runtime: Extract<ClaudeToolRuntime, { type: "http" }>,
  params: unknown,
  signal: AbortSignal | undefined,
): Promise<RuntimeResponse> {
  const response = await fetch(runtime.url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(runtime.headers ?? {}),
    },
    body: JSON.stringify(params),
  });
  const body = await response.text();
  return { status: response.status, body };
}

async function executeModuleTool(
  runtime: Extract<ClaudeToolRuntime, { type: "module" }>,
  params: unknown,
  signal: AbortSignal | undefined,
): Promise<RuntimeResponse> {
  const mod = (await import(runtime.module)) as Record<string, unknown>;
  const exportName = runtime.exportName ?? "execute";
  const fn = mod[exportName];
  if (typeof fn !== "function") {
    return {
      status: 500,
      body: `module tool export "${exportName}" is not a function`,
    };
  }
  const result = await fn(params, { signal });
  return { status: 200, body: serializeResult(result) };
}

function serializeResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result);
}

function errorResult(text: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
} {
  return { content: [{ type: "text", text }], isError: true };
}
