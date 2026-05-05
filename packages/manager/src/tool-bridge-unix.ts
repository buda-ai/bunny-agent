import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PendingTool, ToolBridge } from "./types.js";
import {
  createPendingToolMap,
  dispatchToolBridgePayload,
  parseLineDelimitedBridgeRequest,
  resolveBridgeAbortSignal,
} from "./tool-bridge-dispatch.js";

interface UnixToolBridge {
  bridge: ToolBridge;
  close(): Promise<void>;
}

/**
 * Stand up a Unix-domain-socket bridge that dispatches `{ name, input }`
 * requests to the matching pending host-side tool.
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
  tools: PendingTool[];
  sessionId?: string;
  signal?: AbortSignal;
}): Promise<UnixToolBridge> {
  const dir = await mkdtemp(join(tmpdir(), "bunny-agent-bridge-"));
  const socketPath = join(dir, "bridge.sock");

  const toolMap = createPendingToolMap(input.tools);

  const inFlight = new Set<Promise<void>>();

  // allowHalfOpen so the client can `end()` its write side and we can still
  // write the response back. Without this, Node auto-ends our writable side
  // when the readable side closes and the response never makes it out.
  const server: Server = createServer({ allowHalfOpen: true }, (socket) => {
    const work = handleConnection(socket, toolMap, input.sessionId, input.signal);
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
  toolMap: Map<string, PendingTool>,
  sessionId: string | undefined,
  parentSignal: AbortSignal | undefined,
): Promise<void> {
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

  const parsed = parseLineDelimitedBridgeRequest(raw);
  const response =
    parsed.ok && parsed.payload !== undefined
      ? await dispatchToolBridgePayload(
          parsed.payload,
          toolMap,
          resolveBridgeAbortSignal(parentSignal),
          sessionId,
        )
      : parsed.response;
  await new Promise<void>((resolve) => {
    socket.end(`${JSON.stringify(response)}\n`, () => resolve());
  });
}
