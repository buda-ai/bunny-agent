import { Readable, Writable } from "node:stream";
import { ndJsonStream } from "@agentclientprotocol/sdk";
import {
  type BunnyAgentAcpOptions,
  createBunnyAgentAcpApp,
} from "./acp-agent.js";

export interface StdioServerStreams {
  stdin?: Readable;
  stdout?: Writable;
}

/**
 * Serves BunnyAgent runners as an ACP agent over stdio — the transport editors
 * use when they spawn an agent binary as a subprocess. Resolves when the
 * connection ends (stdin closes).
 *
 * `streams` defaults to `process.stdin`/`process.stdout` and only exists so
 * tests can swap in in-memory duplex streams instead of the real process fds.
 */
export async function runAcpOverStdio(
  options: BunnyAgentAcpOptions = {},
  streams: StdioServerStreams = {},
): Promise<void> {
  const stream = ndJsonStream(
    Writable.toWeb(
      streams.stdout ?? process.stdout,
    ) as WritableStream<Uint8Array>,
    Readable.toWeb(
      streams.stdin ?? process.stdin,
    ) as ReadableStream<Uint8Array>,
  );
  const connection = createBunnyAgentAcpApp(options).connect(stream);
  await connection.closed;
}
