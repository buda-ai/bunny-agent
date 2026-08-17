import { PassThrough, Readable, Writable } from "node:stream";
import {
  client,
  methods,
  ndJsonStream,
  PROTOCOL_VERSION,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("@bunny-agent/runner-harness", async () => {
  const actual = await vi.importActual<
    typeof import("@bunny-agent/runner-harness")
  >("@bunny-agent/runner-harness");
  return {
    ...actual,
    createRunner: vi.fn((opts: Record<string, unknown>) =>
      (async function* () {
        yield `data: ${JSON.stringify({ type: "text-start", id: "m1" })}\n\n`;
        yield `data: ${JSON.stringify({ type: "text-delta", id: "m1", delta: `echo: ${opts.userInput}` })}\n\n`;
        yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
        yield `data: [DONE]\n\n`;
      })(),
    ),
  };
});

import { runAcpOverStdio } from "../stdio-server.js";

/**
 * Wires two PassThrough pairs so the server side reads/writes exactly like a
 * real process's stdin/stdout, and the client side (a genuine ACP client
 * connected over ndJsonStream) drives it through real JSON-RPC framing — the
 * same bytes-on-the-wire path a spawned `bunny-agent acp` subprocess uses,
 * just without an actual OS process.
 */
function pipePair() {
  const serverStdin = new PassThrough(); // client writes here, server reads
  const serverStdout = new PassThrough(); // server writes here, client reads
  return { serverStdin, serverStdout };
}

describe("runAcpOverStdio", () => {
  it("serves initialize + session/new + session/prompt over real ndJsonStream framing", async () => {
    const { serverStdin, serverStdout } = pipePair();

    const serverDone = runAcpOverStdio(
      {},
      { stdin: serverStdin, stdout: serverStdout },
    );

    const clientStream = ndJsonStream(
      Writable.toWeb(serverStdin) as WritableStream<Uint8Array>,
      Readable.toWeb(serverStdout) as ReadableStream<Uint8Array>,
    );

    const clientApp = client({ name: "test-stdio-client" });
    const updates: SessionUpdate[] = [];
    clientApp.onNotification(methods.client.session.update, ({ params }) => {
      updates.push(params.update);
    });
    const connection = clientApp.connect(clientStream);

    try {
      const init = await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      expect(init.agentInfo?.name).toBe("bunny-agent");

      const session = await connection.agent.request(
        methods.agent.session.new,
        { cwd: "/workspace", mcpServers: [] },
      );
      expect(session.sessionId).toBeTruthy();

      const result = await connection.agent.request(
        methods.agent.session.prompt,
        {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "hello over stdio" }],
        },
      );

      expect(result.stopReason).toBe("end_turn");
      expect(
        updates.some(
          (u) =>
            u.sessionUpdate === "agent_message_chunk" &&
            u.content.type === "text" &&
            u.content.text === "echo: hello over stdio",
        ),
      ).toBe(true);
    } finally {
      connection.close();
      serverStdin.end();
    }

    await serverDone;
  });

  it("resolves runAcpOverStdio once the connection closes", async () => {
    const { serverStdin, serverStdout } = pipePair();
    const serverDone = runAcpOverStdio(
      {},
      { stdin: serverStdin, stdout: serverStdout },
    );

    // Closing stdin is how a real editor disconnecting looks on the wire.
    serverStdin.end();

    await expect(serverDone).resolves.toBeUndefined();
  });
});
