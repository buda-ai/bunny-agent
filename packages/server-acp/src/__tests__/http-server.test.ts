import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("@bunny-agent/runner-harness", async () => {
  const actual = await vi.importActual<
    typeof import("@bunny-agent/runner-harness")
  >("@bunny-agent/runner-harness");
  return {
    ...actual,
    createRunner: vi.fn(() =>
      (async function* () {
        yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
        yield `data: [DONE]\n\n`;
      })(),
    ),
  };
});

import { createAcpHttpServer } from "../http-server.js";

const rpc = (body: unknown) =>
  new Request("http://localhost/api/coding/acp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });

describe("createAcpHttpServer", () => {
  it("advertises its protocol and default mount path", () => {
    const server = createAcpHttpServer();
    expect(server.protocol).toBe("acp");
    expect(server.mountPath).toBe("/api/coding/acp");
  });

  it("honours a custom mount path", () => {
    expect(createAcpHttpServer({ mountPath: "/acp" }).mountPath).toBe("/acp");
  });

  it("serves an ACP initialize handshake over Streamable HTTP", async () => {
    const server = createAcpHttpServer();
    try {
      const res = await server.handleWebRequest(
        rpc({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} },
        }),
      );

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain(`"protocolVersion":${PROTOCOL_VERSION}`);
      expect(text).toContain('"name":"bunny-agent"');
    } finally {
      await server.close();
    }
  });

  it("rejects a non-initialize request that carries no session", async () => {
    const server = createAcpHttpServer();
    try {
      const res = await server.handleWebRequest(
        rpc({
          jsonrpc: "2.0",
          id: 2,
          method: "session/new",
          params: { cwd: "/workspace", mcpServers: [] },
        }),
      );
      // Without a prior initialize the server has no connection to route to.
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      await server.close();
    }
  });
});
