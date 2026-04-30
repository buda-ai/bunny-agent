import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RemoteToolSpec, ToolBridge } from "@bunny-agent/manager";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRemoteToolDefinitions } from "../remote-tools.js";

interface UnixCall {
  body: { name: string; input: unknown };
}

interface FakeUnixBridge {
  socketPath: string;
  calls: UnixCall[];
  close: () => Promise<void>;
}

async function startFakeUnixBridge(
  handler: (call: UnixCall) => { status: number; body: string },
): Promise<FakeUnixBridge> {
  const dir = mkdtempSync(join(tmpdir(), "bunny-agent-unix-test-"));
  const socketPath = join(dir, "bridge.sock");
  const calls: UnixCall[] = [];

  const server: NetServer = createNetServer((socket) => {
    let raw = "";
    socket.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    socket.on("end", () => {
      const line = raw.split("\n", 1)[0] ?? raw;
      const body = line ? JSON.parse(line) : { name: "", input: undefined };
      const call: UnixCall = { body };
      calls.push(call);
      const result = handler(call);
      socket.end(`${JSON.stringify(result)}\n`);
    });
  });

  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  return {
    socketPath,
    calls,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          rmSync(dir, { recursive: true, force: true });
          err ? reject(err) : resolve();
        });
      }),
  };
}

interface HttpCall {
  body: { name: string; input: unknown };
}

interface FakeHttpBridge {
  url: string;
  calls: HttpCall[];
  close: () => Promise<void>;
}

async function startFakeHttpBridge(
  handler: (call: HttpCall) => { status: number; body: string },
): Promise<FakeHttpBridge> {
  const calls: HttpCall[] = [];
  const server: HttpServer = createHttpServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : { name: "", input: undefined };
      calls.push({ body });
      const result = handler({ body });
      res.statusCode = result.status;
      res.setHeader("content-type", "text/plain");
      res.end(result.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/invoke`,
    calls,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

const sampleSpec: RemoteToolSpec = {
  name: "get_current_time",
  description: "Return the current ISO timestamp.",
  inputSchema: {
    type: "object",
    properties: {
      timezone: { type: "string", description: "IANA timezone, e.g. UTC" },
    },
    required: [],
  },
};

describe("buildRemoteToolDefinitions / unix transport", () => {
  let server: FakeUnixBridge;
  let bridge: ToolBridge;

  beforeEach(async () => {
    server = await startFakeUnixBridge(({ body }) => ({
      status: 200,
      body: JSON.stringify({
        now: "2026-04-29T00:00:00.000Z",
        echoed: body.input,
      }),
    }));
    bridge = { transport: "unix", socketPath: server.socketPath };
  });

  afterEach(async () => {
    await server.close();
  });

  it("forwards name + input over the unix socket", async () => {
    const [tool] = buildRemoteToolDefinitions([sampleSpec], bridge);
    expect(tool.name).toBe("get_current_time");

    const result = await tool.execute(
      "tc_1",
      { timezone: "UTC" },
      undefined,
      undefined,
      undefined as never,
    );

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].body).toEqual({
      name: "get_current_time",
      input: { timezone: "UTC" },
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: JSON.stringify({
        now: "2026-04-29T00:00:00.000Z",
        echoed: { timezone: "UTC" },
      }),
    });
  });

  it("surfaces non-2xx responses as a tool error message", async () => {
    await server.close();
    server = await startFakeUnixBridge(() => ({
      status: 403,
      body: "tool not enabled for this agent",
    }));
    bridge = { transport: "unix", socketPath: server.socketPath };

    const [tool] = buildRemoteToolDefinitions([sampleSpec], bridge);
    const result = await tool.execute(
      "tc_2",
      {},
      undefined,
      undefined,
      undefined as never,
    );

    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/status 403/);
    expect(text).toMatch(/tool not enabled/);
  });

  it("rejects with a transport error when signal is pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const [tool] = buildRemoteToolDefinitions([sampleSpec], bridge);
    const result = await tool.execute(
      "tc_3",
      {},
      controller.signal,
      undefined,
      undefined as never,
    );

    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/transport error/i);
    expect(text).toMatch(/abort/i);
  });

  it("returns a transport error when the socket path does not exist", async () => {
    bridge = {
      transport: "unix",
      socketPath: join(tmpdir(), "bunny-agent-nope.sock"),
    };
    const [tool] = buildRemoteToolDefinitions([sampleSpec], bridge);
    const result = await tool.execute(
      "tc_4",
      {},
      undefined,
      undefined,
      undefined as never,
    );
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/transport error/i);
  });
});

describe("buildRemoteToolDefinitions / byte-equality across transports", () => {
  it("produces identical tool results for identical server responses (success)", async () => {
    const respond = () => ({
      status: 200,
      body: JSON.stringify({ ok: true, value: 42 }),
    });
    const httpBridgeServer = await startFakeHttpBridge(respond);
    const unixBridgeServer = await startFakeUnixBridge(respond);
    try {
      const httpBridge: ToolBridge = {
        transport: "http",
        url: httpBridgeServer.url,
        token: "tok",
      };
      const unixBridge: ToolBridge = {
        transport: "unix",
        socketPath: unixBridgeServer.socketPath,
      };
      const [httpTool] = buildRemoteToolDefinitions([sampleSpec], httpBridge);
      const [unixTool] = buildRemoteToolDefinitions([sampleSpec], unixBridge);

      const input = { timezone: "UTC" };
      const httpResult = await httpTool.execute(
        "tc",
        input,
        undefined,
        undefined,
        undefined as never,
      );
      const unixResult = await unixTool.execute(
        "tc",
        input,
        undefined,
        undefined,
        undefined as never,
      );
      expect(unixResult).toEqual(httpResult);
    } finally {
      await httpBridgeServer.close();
      await unixBridgeServer.close();
    }
  });

  it("produces identical tool results for identical server responses (error)", async () => {
    const respond = () => ({ status: 403, body: "denied" });
    const httpBridgeServer = await startFakeHttpBridge(respond);
    const unixBridgeServer = await startFakeUnixBridge(respond);
    try {
      const httpBridge: ToolBridge = {
        transport: "http",
        url: httpBridgeServer.url,
        token: "tok",
      };
      const unixBridge: ToolBridge = {
        transport: "unix",
        socketPath: unixBridgeServer.socketPath,
      };
      const [httpTool] = buildRemoteToolDefinitions([sampleSpec], httpBridge);
      const [unixTool] = buildRemoteToolDefinitions([sampleSpec], unixBridge);

      const httpResult = await httpTool.execute(
        "tc",
        {},
        undefined,
        undefined,
        undefined as never,
      );
      const unixResult = await unixTool.execute(
        "tc",
        {},
        undefined,
        undefined,
        undefined as never,
      );
      expect(unixResult).toEqual(httpResult);
    } finally {
      await httpBridgeServer.close();
      await unixBridgeServer.close();
    }
  });
});
