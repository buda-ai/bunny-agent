import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUnixToolBridge } from "../tool-bridge-unix.js";
import type { RemoteTool } from "../types.js";

interface SocketResponse {
  status: number;
  body: string;
}

async function callBridge(
  socketPath: string,
  request: { name: string; input: unknown },
): Promise<SocketResponse> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let raw = "";
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    socket.on("end", () => {
      const line = raw.split("\n", 1)[0] ?? raw;
      try {
        resolve(JSON.parse(line) as SocketResponse);
      } catch (err) {
        reject(err);
      }
    });
    socket.end(`${JSON.stringify(request)}\n`);
  });
}

const echoTool: RemoteTool = {
  name: "echo",
  description: "Echo input back",
  inputSchema: { type: "object", properties: {}, required: [] },
  async execute(input) {
    return { echoed: input };
  },
};

const stringTool: RemoteTool = {
  name: "shout",
  description: "Return a plain string",
  inputSchema: { type: "object", properties: {}, required: [] },
  async execute(input) {
    const value = (input as { word?: string } | undefined)?.word ?? "";
    return value.toUpperCase();
  },
};

const flakyTool: RemoteTool = {
  name: "flaky",
  description: "Always throws",
  inputSchema: { type: "object", properties: {}, required: [] },
  async execute() {
    throw new Error("kaboom");
  },
};

describe("createUnixToolBridge", () => {
  let handle: Awaited<ReturnType<typeof createUnixToolBridge>>;

  beforeEach(async () => {
    handle = await createUnixToolBridge({
      tools: [echoTool, stringTool, flakyTool],
    });
  });

  afterEach(async () => {
    await handle.close();
  });

  it("dispatches by tool name and JSON-stringifies object results", async () => {
    expect(handle.bridge.transport).toBe("unix");
    const socketPath =
      handle.bridge.transport === "unix" ? handle.bridge.socketPath : "";
    const response = await callBridge(socketPath, {
      name: "echo",
      input: { hello: "world" },
    });
    expect(response).toEqual({
      status: 200,
      body: JSON.stringify({ echoed: { hello: "world" } }),
    });
  });

  it("returns string results verbatim (no extra JSON wrap)", async () => {
    const socketPath =
      handle.bridge.transport === "unix" ? handle.bridge.socketPath : "";
    const response = await callBridge(socketPath, {
      name: "shout",
      input: { word: "hi" },
    });
    expect(response).toEqual({ status: 200, body: "HI" });
  });

  it("returns 404 for unknown tool names", async () => {
    const socketPath =
      handle.bridge.transport === "unix" ? handle.bridge.socketPath : "";
    const response = await callBridge(socketPath, {
      name: "nope",
      input: {},
    });
    expect(response.status).toBe(404);
    expect(response.body).toMatch(/unknown tool/);
  });

  it("returns 500 with the thrown message", async () => {
    const socketPath =
      handle.bridge.transport === "unix" ? handle.bridge.socketPath : "";
    const response = await callBridge(socketPath, {
      name: "flaky",
      input: {},
    });
    expect(response.status).toBe(500);
    expect(response.body).toMatch(/kaboom/);
  });

  it("returns 400 for malformed JSON request", async () => {
    const socketPath =
      handle.bridge.transport === "unix" ? handle.bridge.socketPath : "";
    const response = await new Promise<SocketResponse>((resolve, reject) => {
      const socket = createConnection(socketPath);
      let raw = "";
      socket.on("error", reject);
      socket.on("data", (chunk) => {
        raw += chunk.toString("utf8");
      });
      socket.on("end", () => {
        const line = raw.split("\n", 1)[0] ?? raw;
        resolve(JSON.parse(line) as SocketResponse);
      });
      socket.end("not-json\n");
    });
    expect(response.status).toBe(400);
  });

  it("places the socket inside a 0700 directory under tmp", async () => {
    const socketPath =
      handle.bridge.transport === "unix" ? handle.bridge.socketPath : "";
    const dir = dirname(socketPath);
    const info = await stat(dir);
    // Mode bits 0o700 — owner rwx, group/other none
    expect(info.mode & 0o777).toBe(0o700);
  });

  it("close() is idempotent and cleans up the socket dir", async () => {
    const socketPath =
      handle.bridge.transport === "unix" ? handle.bridge.socketPath : "";
    const dir = dirname(socketPath);
    expect(existsSync(socketPath)).toBe(true);
    await handle.close();
    await handle.close(); // second close — no-op, no throw
    expect(existsSync(dir)).toBe(false);
  });
});
