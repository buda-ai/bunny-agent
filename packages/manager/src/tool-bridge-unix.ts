import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RemoteTool, ToolBridge } from "./types.js";

/**
 * Wire-format response the unix bridge writes back per request. Mirrors the
 * `{ status, body }` shape the HTTP transport surfaces, so client-side handling
 * (see `@bunny-agent/runner-harness/remote-tools`) is byte-equal across
 * transports.
 */
interface BridgeResponse {
  status: number;
  body: string;
}

interface RemoteToolBridge {
  bridge: ToolBridge;
  close(): Promise<void>;
}

/**
 * Stand up a Unix-domain-socket bridge that dispatches `{ name, input }`
 * requests to the matching {@link RemoteTool}.
 *
 * Auth model: the socket lives inside a freshly-created 0700 directory under
 * `os.tmpdir()`, so only the calling user can connect. No tokens.
 *
 * Wire format (one connection per call):
 *   request:  one line  `{"name": string, "input": unknown}\n` (client half-closes write)
 *   response: one line  `{"status": number, "body": string}\n` (server closes)
 *
 * `close()` is idempotent: it stops accepting new connections, waits for
 * in-flight handlers to finish, then unlinks the socket and removes the
 * containing directory.
 */
export async function createUnixToolBridge(input: {
  tools: RemoteTool[];
  sessionId?: string;
}): Promise<RemoteToolBridge> {
  const dir = await mkdtemp(join(tmpdir(), "bunny-agent-bridge-"));
  const socketPath = join(dir, "bridge.sock");

  const toolMap = new Map<string, RemoteTool>();
  for (const tool of input.tools) {
    toolMap.set(tool.name, tool);
  }

  const inFlight = new Set<Promise<void>>();

  // allowHalfOpen so the client can `end()` its write side and we can still
  // write the response back. Without this, Node auto-ends our writable side
  // when the readable side closes and the response never makes it out.
  const server: Server = createServer({ allowHalfOpen: true }, (socket) => {
    const work = handleConnection(socket, toolMap, input.sessionId);
    inFlight.add(work);
    work.finally(() => inFlight.delete(work));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  let closing: Promise<void> | null = null;
  const close = async (): Promise<void> => {
    if (closing) return closing;
    closing = (async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await Promise.allSettled([...inFlight]);
      await rm(dir, { recursive: true, force: true });
    })();
    return closing;
  };

  return {
    bridge: { transport: "unix", socketPath },
    close,
  };
}

async function handleConnection(
  socket: Socket,
  toolMap: Map<string, RemoteTool>,
  sessionId: string | undefined,
): Promise<void> {
  const controller = new AbortController();
  socket.on("close", () => controller.abort());

  let raw = "";
  let ended = false;

  await new Promise<void>((resolve) => {
    socket.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    socket.on("end", () => {
      ended = true;
      resolve();
    });
    socket.on("error", () => {
      resolve();
    });
  });

  if (!ended) return;

  const response = await dispatch(raw, toolMap, controller.signal, sessionId);
  await new Promise<void>((resolve) => {
    socket.end(`${JSON.stringify(response)}\n`, () => resolve());
  });
}

async function dispatch(
  raw: string,
  toolMap: Map<string, RemoteTool>,
  signal: AbortSignal,
  sessionId: string | undefined,
): Promise<BridgeResponse> {
  const line = raw.split("\n", 1)[0] ?? raw;
  if (!line) {
    return { status: 400, body: "empty request" };
  }

  let payload: { name?: unknown; input?: unknown };
  try {
    payload = JSON.parse(line) as { name?: unknown; input?: unknown };
  } catch {
    return { status: 400, body: "invalid JSON request" };
  }

  const name = typeof payload.name === "string" ? payload.name : "";
  if (!name) {
    return { status: 400, body: "missing tool name" };
  }

  const tool = toolMap.get(name);
  if (!tool) {
    return { status: 404, body: `unknown tool "${name}"` };
  }

  try {
    const result = await tool.execute(payload.input, { signal, sessionId });
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
