import { createConnection } from "node:net";
import type { RemoteToolSpec, ToolBridge } from "@bunny-agent/manager";
import type { ToolDefinition } from "@bunny-agent/runner-pi";
import { Type } from "@sinclair/typebox";

const LOG_PREFIX = "[bunny-agent:remote-tools]";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: undefined;
};

type BridgeResponse = { status: number; body: string };

/**
 * Wrap a list of remote tool specs as pi-runner-native ToolDefinitions.
 *
 * Each generated tool's `execute` dispatches `{ name, input }` over the bridge
 * transport ({@link ToolBridge.transport}) and returns the response as a
 * single text content block. The caller's bridge endpoint is responsible for
 * dispatching by name and validating arguments.
 *
 * Both transports normalize to the same `{ status, body }` envelope so the
 * resulting tool result is byte-equal across transports for equivalent server
 * responses.
 */
export function buildRemoteToolDefinitions(
  tools: RemoteToolSpec[],
  bridge: ToolBridge,
): ToolDefinition[] {
  return tools.map((spec) => buildOne(spec, bridge));
}

function buildOne(spec: RemoteToolSpec, bridge: ToolBridge): ToolDefinition {
  // Type.Unsafe wraps an arbitrary JSON-schema object as a TypeBox TSchema
  // without local validation. We pass it verbatim to the LLM; the caller is
  // responsible for argument validation when the bridge dispatches the call.
  // Cast through `unknown` because pi-coding-agent's TSchema is structurally
  // identical to ours but resolves to a different package instance under the
  // workspace's hoisted typebox versions.
  const parameters = Type.Unsafe(spec.inputSchema) as unknown as ToolDefinition["parameters"];

  return {
    name: spec.name,
    label: spec.name,
    description: spec.description,
    parameters,
    async execute(_toolCallId, params, signal) {
      let response: BridgeResponse;
      try {
        response =
          bridge.transport === "http"
            ? await sendHttpRequest(bridge, spec.name, params, signal)
            : await sendUnixRequest(bridge, spec.name, params, signal);
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

async function sendHttpRequest(
  bridge: Extract<ToolBridge, { transport: "http" }>,
  toolName: string,
  params: unknown,
  signal: AbortSignal | undefined,
): Promise<BridgeResponse> {
  const response = await fetch(bridge.url, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${bridge.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: toolName, input: params }),
  });
  const body = await response.text();
  return { status: response.status, body };
}

function sendUnixRequest(
  bridge: Extract<ToolBridge, { transport: "unix" }>,
  toolName: string,
  params: unknown,
  signal: AbortSignal | undefined,
): Promise<BridgeResponse> {
  return new Promise<BridgeResponse>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }

    const socket = createConnection(bridge.socketPath);
    let raw = "";
    let settled = false;

    const onAbort = () => done(new Error("aborted"));

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      socket.removeAllListeners();
      socket.destroy();
    };

    const done = (err: Error | null, value?: BridgeResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(value as BridgeResponse);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    socket.on("error", (err) => done(err));
    socket.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    socket.on("end", () => {
      try {
        const line = raw.split("\n", 1)[0] ?? raw;
        if (!line) {
          throw new Error("empty response from bridge");
        }
        const parsed = JSON.parse(line) as Partial<BridgeResponse>;
        if (typeof parsed.status !== "number" || typeof parsed.body !== "string") {
          throw new Error("malformed bridge response");
        }
        done(null, { status: parsed.status, body: parsed.body });
      } catch (err) {
        done(err instanceof Error ? err : new Error(String(err)));
      }
    });

    // Half-close the write side so the server knows the request is complete.
    // The connection stays open for the response until the server ends it.
    socket.end(`${JSON.stringify({ name: toolName, input: params })}\n`);
  });
}

function okResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
    details: undefined,
  };
}

function statusErrorResult(toolName: string, status: number, body: string): ToolResult {
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
