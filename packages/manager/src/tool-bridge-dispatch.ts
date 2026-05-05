import type { PendingTool } from "./types.js";

export interface BridgeResponse {
  status: number;
  body: string;
}

export interface ParsedBridgeRequest {
  ok: boolean;
  payload?: unknown;
  response?: BridgeResponse;
}

const NEVER_ABORT_SIGNAL = new AbortController().signal;

export function resolveBridgeAbortSignal(signal?: AbortSignal): AbortSignal {
  return signal ?? NEVER_ABORT_SIGNAL;
}

export function createPendingToolMap(
  tools: PendingTool[],
): Map<string, PendingTool> {
  const toolMap = new Map<string, PendingTool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }
  return toolMap;
}

export function parseLineDelimitedBridgeRequest(raw: string): ParsedBridgeRequest {
  const line = raw.split("\n", 1)[0] ?? raw;
  return parseBridgeJson(line);
}

export function parseBridgeJson(raw: string): ParsedBridgeRequest {
  if (!raw) {
    return { ok: false, response: { status: 400, body: "empty request" } };
  }

  try {
    return { ok: true, payload: JSON.parse(raw) };
  } catch {
    return { ok: false, response: { status: 400, body: "invalid JSON request" } };
  }
}

export async function dispatchToolBridgePayload(
  payload: unknown,
  toolMap: Map<string, PendingTool>,
  signal: AbortSignal,
  sessionId: string | undefined,
): Promise<BridgeResponse> {
  const request = payload as { name?: unknown; input?: unknown };
  const name = typeof request?.name === "string" ? request.name : "";
  if (!name) {
    return { status: 400, body: "missing tool name" };
  }

  const tool = toolMap.get(name);
  if (!tool) {
    return { status: 404, body: `unknown tool "${name}"` };
  }

  try {
    const result = await tool.execute(request.input, { signal, sessionId });
    return { status: 200, body: serializeResult(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 500, body: `tool execution failed: ${message}` };
  }
}

function serializeResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result);
}
