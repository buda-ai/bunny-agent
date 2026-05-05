import type { ToolRef } from "@bunny-agent/manager";
import type { ToolDefinition } from "@bunny-agent/runner-pi";
import { Type } from "@sinclair/typebox";

const LOG_PREFIX = "[bunny-agent:remote-tools]";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: undefined;
};

type BridgeResponse = { status: number; body: string };

/**
 * Wrap a list of tool refs as pi-runner-native ToolDefinitions.
 *
 * Each generated tool's `execute` dispatches to the runtime embedded in the
 * tool ref and returns the response as a single text content block.
 */
export function buildToolDefinitions(tools: ToolRef[]): ToolDefinition[] {
  return tools.map((spec) => buildOne(spec));
}

function buildOne(spec: ToolRef): ToolDefinition {
  // Type.Unsafe wraps an arbitrary JSON-schema object as a TypeBox TSchema
  // without local validation. We pass it verbatim to the LLM; the caller is
  // responsible for argument validation in the selected runtime.
  // Cast through `unknown` because pi-coding-agent's TSchema is structurally
  // identical to ours but resolves to a different package instance under the
  // workspace's hoisted typebox versions.
  const parameters = Type.Unsafe(
    spec.inputSchema,
  ) as unknown as ToolDefinition["parameters"];

  return {
    name: spec.name,
    label: spec.name,
    description: spec.description,
    parameters,
    async execute(_toolCallId, params, signal) {
      let response: BridgeResponse;
      try {
        response = await executeToolRef(spec, params, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return transportErrorResult(spec.name, message);
      }
      if (response.status < 200 || response.status >= 300) {
        return statusErrorResult(spec.name, response.status, response.body);
      }
      return okResult(response.body);
    },
  };
}

async function executeToolRef(
  spec: ToolRef,
  params: unknown,
  signal: AbortSignal | undefined,
): Promise<BridgeResponse> {
  switch (spec.runtime.type) {
    case "http":
      return sendDirectHttpRequest(spec.runtime, params, signal);
    case "module":
      return executeModuleTool(spec.runtime, params, signal);
  }
  return assertNever(spec.runtime);
}

function assertNever(value: never): never {
  throw new Error(`unsupported tool runtime: ${JSON.stringify(value)}`);
}

async function sendDirectHttpRequest(
  runtime: Extract<ToolRef["runtime"], { type: "http" }>,
  params: unknown,
  signal: AbortSignal | undefined,
): Promise<BridgeResponse> {
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
  runtime: Extract<ToolRef["runtime"], { type: "module" }>,
  params: unknown,
  signal: AbortSignal | undefined,
): Promise<BridgeResponse> {
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

function okResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
    details: undefined,
  };
}

function statusErrorResult(
  toolName: string,
  status: number,
  body: string,
): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `${LOG_PREFIX} tool "${toolName}" failed (status ${status}): ${body}`,
      },
    ],
    details: undefined,
  };
}

function transportErrorResult(toolName: string, message: string): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `${LOG_PREFIX} tool "${toolName}" transport error: ${message}`,
      },
    ],
    details: undefined,
  };
}

function serializeResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result);
}
