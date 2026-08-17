import { Readable, Writable } from "node:stream";
import { ndJsonStream } from "@agentclientprotocol/sdk";
import {
  type BunnyAgentAcpOptions,
  createBunnyAgentAcpApp,
} from "./acp-agent.js";

/**
 * Serves BunnyAgent runners as an ACP agent over stdio — the transport editors
 * use when they spawn an agent binary as a subprocess. Resolves when the
 * connection ends (stdin closes).
 */
export async function runAcpOverStdio(
  options: BunnyAgentAcpOptions = {},
): Promise<void> {
  const stream = ndJsonStream(
    Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
    Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
  );
  const connection = createBunnyAgentAcpApp(options).connect(stream);
  await connection.closed;
}
