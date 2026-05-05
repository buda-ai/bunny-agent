import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const LOG_PREFIX = "[bunny-agent:pi-tool-ref]";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: undefined;
};

type RuntimeResponse = { status: number; body: string };

export type PiToolRuntime =
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

export interface PiToolRef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  runtime: PiToolRuntime;
}

/**
 * Convert serializable Bunny tool refs into pi-runner-native ToolDefinitions.
 */
export function buildToolDefinitionsFromRefs(
  tools: PiToolRef[],
): ToolDefinition[] {
  return tools.map((spec) => buildOne(spec));
}

function buildOne(spec: PiToolRef): ToolDefinition {
  // Type.Unsafe wraps an arbitrary JSON-schema object as a TypeBox TSchema
  // without local validation. We pass it verbatim to the LLM; the selected
  // runtime is responsible for argument validation.
  const parameters = Type.Unsafe(
    spec.inputSchema,
  ) as unknown as ToolDefinition["parameters"];

  return {
    name: spec.name,
    label: spec.name,
    description: spec.description,
    parameters,
    async execute(_toolCallId, params, signal) {
      let response: RuntimeResponse;
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
  spec: PiToolRef,
  params: unknown,
  signal: AbortSignal | undefined,
): Promise<RuntimeResponse> {
  switch (spec.runtime.type) {
    case "http":
      return sendDirectHttpRequest(spec.runtime, params, signal);
    case "module":
      return executeModuleTool(spec.runtime, params, signal);
  }
}

async function sendDirectHttpRequest(
  runtime: Extract<PiToolRef["runtime"], { type: "http" }>,
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
  runtime: Extract<PiToolRef["runtime"], { type: "module" }>,
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
