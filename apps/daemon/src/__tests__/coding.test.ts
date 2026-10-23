import * as fs from "node:fs/promises";
import type * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import * as acp from "@agentclientprotocol/sdk";
import { createHttpStream } from "@agentclientprotocol/sdk/experimental/http-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock runner-harness before importing server/nextjs
// Track createRunner calls for assertion
const createRunnerCalls: Array<Record<string, unknown>> = [];
let controlRunGate: Promise<void> | undefined;

vi.mock("@bunny-agent/runner-harness", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@bunny-agent/runner-harness")>();
  return {
    ...actual,
    createRunner: vi.fn(
      (opts: { input?: unknown; userInput?: string; yolo?: boolean }) => {
        createRunnerCalls.push(opts);
        if (opts.userInput === "daemon control test") {
          return (async function* () {
            yield `data: ${JSON.stringify({ type: "start" })}\n\n`;
            await controlRunGate;
            yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
            yield `data: [DONE]\n\n`;
          })();
        }
        if (opts.userInput === "__THROW__") {
          // biome-ignore lint/correctness/useYield: throw-only generator simulates immediate runner failure
          return (async function* () {
            throw new Error("runner exploded");
          })();
        }
        if (opts.userInput === "__SLOW__") {
          // Simulate a long-running tool execution (e.g. image generation).
          return (async function* () {
            yield `data: ${JSON.stringify({ type: "tool-input-start", toolCallId: "t1", toolName: "generate_image" })}\n\n`;
            await new Promise<void>((resolve) => setTimeout(resolve, 40_000));
            yield `data: ${JSON.stringify({ type: "tool-output-available", toolCallId: "t1", output: "/agent/img.png" })}\n\n`;
            yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
            yield `data: [DONE]\n\n`;
          })();
        }
        if (opts.userInput === "__SLOW_SHORT__") {
          // Short delay (100ms) — used with a patched HEARTBEAT_INTERVAL_MS (20ms)
          // so heartbeats fire multiple times within the pause.
          return (async function* () {
            yield `data: ${JSON.stringify({ type: "tool-input-start", toolCallId: "t1", toolName: "generate_image" })}\n\n`;
            await new Promise<void>((resolve) => setTimeout(resolve, 100));
            yield `data: ${JSON.stringify({ type: "tool-output-available", toolCallId: "t1", output: "/agent/img.png" })}\n\n`;
            yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
            yield `data: [DONE]\n\n`;
          })();
        }
        // Return an async iterable that yields SSE-style chunks.
        return (async function* () {
          if (
            opts.userInput === "streamable lifecycle" ||
            opts.userInput === "next acp"
          ) {
            yield `data: ${JSON.stringify({ type: "text-start", id: "m1" })}\n\n`;
            yield `data: ${JSON.stringify({ type: "text-delta", id: "m1", delta: `echo: ${opts.userInput}` })}\n\n`;
            yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
            yield `data: [DONE]\n\n`;
            return;
          }
          yield `data: ${JSON.stringify({ type: "text", text: `echo: ${opts.userInput}` })}\n\n`;
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
          yield `data: [DONE]\n\n`;
        })();
      },
    ),
  };
});

import {
  codingRunStream,
  setHeartbeatIntervalMs,
} from "@bunny-agent/server-ai-sdk";
import { createNextHandler } from "../nextjs.js";
import { createDaemon } from "../server.js";

const PORT = 13081;
const BASE = `http://localhost:${PORT}`;
let server: http.Server;
let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "daemon-coding-test-"));
  server = createDaemon({ host: "127.0.0.1", port: PORT, root });
  await new Promise<void>((r) => server.listen(PORT, r));
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await fs.rm(root, { recursive: true });
});

describe("POST /api/coding/run (standalone server)", () => {
  it("streams NDJSON response", async () => {
    const res = await fetch(`${BASE}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userInput: "hello", runner: "claude" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");

    const text = await res.text();
    const dataLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("data: "));
    const payloads = dataLines.map((l) => l.slice("data: ".length));

    const first = JSON.parse(payloads[0]);
    expect(first.type).toBe("text");
    expect(first.text).toBe("echo: hello");

    const finish = JSON.parse(payloads[1]);
    expect(finish.type).toBe("finish");
    expect(finish.finishReason).toBe("stop");

    expect(payloads[payloads.length - 1]).toBe("[DONE]");
  });

  it("returns error for missing userInput", async () => {
    const res = await fetch(`${BASE}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // createRunner will be called with undefined userInput — still streams
    expect(res.status).toBe(200);
  });
});

describe("POST /api/coding/acp (standalone server)", () => {
  it("serves an ACP initialize handshake alongside the AI SDK route", async () => {
    const res = await fetch(`${BASE}/api/coding/acp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: 1, clientCapabilities: {} },
      }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"protocolVersion"');
    expect(text).toContain('"name":"bunny-agent"');
  });

  it("does not shadow the AI SDK route", async () => {
    const res = await fetch(`${BASE}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userInput: "still works" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    expect(await res.text()).toContain("echo: still works");
  });

  it("supports the full Streamable HTTP lifecycle", async () => {
    const updates: acp.SessionUpdate[] = [];
    const stream = createHttpStream(`${BASE}/api/coding/acp`);
    try {
      const response = await acp
        .client({ name: "daemon-acp-test" })
        .onNotification(acp.methods.client.session.update, ({ params }) => {
          updates.push(params.update);
        })
        .connectWith(stream, async (connection) => {
          await connection.request(acp.methods.agent.initialize, {
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: {},
          });
          const session = await connection.request(
            acp.methods.agent.session.new,
            {
              cwd: root,
              mcpServers: [],
            },
          );
          return connection.request(acp.methods.agent.session.prompt, {
            sessionId: session.sessionId,
            prompt: [{ type: "text", text: "streamable lifecycle" }],
          });
        });

      expect(response.stopReason).toBe("end_turn");
      expect(updates).toContainEqual(
        expect.objectContaining({
          sessionUpdate: "agent_message_chunk",
          content: expect.objectContaining({
            text: "echo: streamable lifecycle",
          }),
        }),
      );
    } finally {
      await stream.writable.close();
    }
  });
});

describe("codingRunStream (Web Response)", () => {
  it("returns streaming Response with NDJSON", async () => {
    const res = await codingRunStream({ userInput: "test" }, {});

    expect(res.headers.get("content-type")).toBe("application/x-ndjson");

    const text = await res.text();
    const dataLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("data: "));
    const payloads = dataLines.map((l) => l.slice("data: ".length));

    expect(JSON.parse(payloads[0]).text).toBe("echo: test");
    expect(JSON.parse(payloads[1]).type).toBe("finish");
    expect(payloads[payloads.length - 1]).toBe("[DONE]");
  });

  it("forwards structured input without requiring legacy text", async () => {
    const input = {
      version: 1 as const,
      input: [{ type: "text" as const, text: "structured" }],
      capabilities: [],
      execution: {},
    };
    const res = await codingRunStream({ input }, {});
    await res.text();

    expect(createRunnerCalls.at(-1)).toMatchObject({ input });
  });

  it("forwards request-scoped MCP config to the runner harness", async () => {
    const mcpConfig = {
      mcpServers: {
        remote: { url: "https://mcp.example.com" },
      },
    };
    const res = await codingRunStream(
      {
        userInput: "use mcp",
        runner: "pi",
        model: "openai:gpt-5",
        mcpConfig,
      },
      {},
    );

    await res.text();

    expect(createRunnerCalls.at(-1)).toMatchObject({
      runner: "pi",
      mcpConfig,
    });
  });

  it("forwards the interactive question timeout to the runner harness", async () => {
    const res = await codingRunStream(
      {
        userInput: "ask a question",
        runner: "pi",
        askUserQuestionTimeoutMs: 1_500,
      },
      {},
    );

    await res.text();

    expect(createRunnerCalls.at(-1)).toMatchObject({
      askUserQuestionTimeoutMs: 1_500,
    });
  });
});

describe("createNextHandler", () => {
  const handler = createNextHandler({ root: os.tmpdir() });
  let adapterBase: string;
  let adapterRoot: string;
  let adapterHandler: ReturnType<typeof createNextHandler>;

  beforeAll(async () => {
    adapterBase = await fs.mkdtemp(path.join(os.tmpdir(), "daemon-next-test-"));
    adapterRoot = path.join(adapterBase, "agent");
    await fs.mkdir(adapterRoot, { recursive: true });
    adapterHandler = createNextHandler({ root: adapterRoot });
  });

  afterAll(async () => {
    await fs.rm(adapterBase, { recursive: true });
  });

  it("routes /api/daemon/api/coding/run to stream", async () => {
    const req = new Request("http://localhost/api/daemon/api/coding/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userInput: "nextjs test" }),
    });

    const res = await handler(req);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");

    const text = await res.text();
    expect(text).toContain("echo: nextjs test");
  });

  it("routes /api/daemon/api/coding/control to the shared control registry", async () => {
    const probeReq = new Request(
      "http://localhost/api/daemon/api/coding/control",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, operation: "capabilities" }),
      },
    );
    const probeRes = await handler(probeReq);
    expect(probeRes.status).toBe(200);
    await expect(probeRes.json()).resolves.toEqual({
      version: 1,
      supportedPiSteer: true,
    });

    const statusReq = new Request(
      "http://localhost/api/daemon/api/coding/control",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          operation: "status",
          runId: "nextjs-unknown-run",
          token: "z".repeat(44),
        }),
      },
    );
    const statusRes = await handler(statusReq);
    expect(statusRes.status).toBe(404);
  });

  it("routes ACP Streamable HTTP GET and DELETE through the adapter", async () => {
    const stream = createHttpStream(
      "http://localhost/api/daemon/api/coding/acp",
      {
        fetch: async (requestInput, requestInit) =>
          handler(new Request(requestInput, requestInit)),
      },
    );
    try {
      const result = await acp
        .client({ name: "next-acp-test" })
        .connectWith(stream, async (connection) => {
          await connection.request(acp.methods.agent.initialize, {
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: {},
          });
          const session = await connection.request(
            acp.methods.agent.session.new,
            {
              cwd: os.tmpdir(),
              mcpServers: [],
            },
          );
          return connection.request(acp.methods.agent.session.prompt, {
            sessionId: session.sessionId,
            prompt: [{ type: "text", text: "next acp" }],
          });
        });
      expect(result.stopReason).toBe("end_turn");
    } finally {
      await stream.writable.close();
    }
  });

  it("routes /api/daemon/healthz to JSON", async () => {
    const req = new Request("http://localhost/api/daemon/healthz");
    const res = await handler(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 404 for unknown route", async () => {
    const req = new Request("http://localhost/api/daemon/nope");
    const res = await handler(req);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(res.status).toBe(404);
  });

  it("routes fs write+read through nextjs adapter", async () => {
    const writeReq = new Request("http://localhost/api/daemon/api/fs/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "nextjs-test.txt", content: "via adapter" }),
    });
    const writeRes = await handler(writeReq);
    expect((await writeRes.json()).ok).toBe(true);

    const readReq = new Request(
      "http://localhost/api/daemon/api/fs/read?path=nextjs-test.txt",
    );
    const readRes = await handler(readReq);
    const readJson = await readRes.json();
    expect(readJson.ok).toBe(true);
    expect(readJson.data.content).toBe("via adapter");
  });

  it("routes fs write-stream through nextjs adapter", async () => {
    // `write-stream` defaults to the "agent" volume when the query omits
    // one, and `resolveVolumeRoot` treats "agent"/"space" as well-known
    // mounts: if a real `/agent` (or `/space`) directory exists on the host
    // running the test, it wins over this test's scoped `adapterRoot`. Use
    // an explicit non-well-known volume so the write is guaranteed to land
    // under `adapterRoot`'s scoped volumes dir, never a global host mount.
    const payload = Buffer.from("next adapter stream");
    const writeReq = new Request(
      "http://localhost/api/daemon/api/fs/write-stream?path=next/stream.bin&volume=fixture",
      {
        method: "PUT",
        body: payload,
      },
    );
    const writeRes = await adapterHandler(writeReq);
    const writeJson = await writeRes.json();
    expect(writeJson.ok).toBe(true);
    expect(writeJson.data.size).toBe(payload.length);

    const expectedPath = path.join(
      adapterRoot,
      "volumes",
      "fixture",
      "next",
      "stream.bin",
    );
    expect(writeJson.data.path).toBe(expectedPath);

    const written = await fs.readFile(expectedPath);
    expect(written.equals(payload)).toBe(true);
  });

  it("supports custom prefix", async () => {
    const custom = createNextHandler({
      root: os.tmpdir(),
      prefix: "/my/prefix",
    });
    const req = new Request("http://localhost/my/prefix/healthz");
    const res = await custom(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

describe("coding/run error handling", () => {
  it("streams error SSE when runner throws (standalone)", async () => {
    const res = await fetch(`${BASE}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userInput: "__THROW__", runner: "claude" }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const dataLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("data: "));
    const payloads = dataLines.map((l) => l.slice("data: ".length));

    const err = JSON.parse(payloads[0]);
    expect(err.type).toBe("error");
    expect(err.errorText).toBe("runner exploded");

    const finish = JSON.parse(payloads[1]);
    expect(finish.type).toBe("finish");
    expect(finish.finishReason).toBe("error");

    expect(payloads[payloads.length - 1]).toBe("[DONE]");
  });

  it("streams error SSE when runner throws (web response)", async () => {
    const res = await codingRunStream({ userInput: "__THROW__" }, {});
    const text = await res.text();
    const dataLines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("data: "));
    const payloads = dataLines.map((l) => l.slice("data: ".length));

    const err = JSON.parse(payloads[0]);
    expect(err.type).toBe("error");
    expect(err.errorText).toBe("runner exploded");
  });
});

describe("POST /api/coding/control (standalone daemon)", () => {
  async function controlPost(body: unknown) {
    const r = await fetch(`${BASE}/api/coding/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  }

  it("generic capabilities probe needs no auth and never 404s", async () => {
    const { status, body } = await controlPost({
      version: 1,
      operation: "capabilities",
    });
    expect(status).toBe(200);
    expect(body).toEqual({ version: 1, supportedPiSteer: true });
  });

  it("status on an unregistered run 404s", async () => {
    const { status, body } = await controlPost({
      version: 1,
      operation: "status",
      runId: "never-registered",
      token: "x".repeat(44),
    });
    expect(status).toBe(404);
    expect(body).toMatchObject({ ok: false });
  });

  it("a run registered via /api/coding/run is steerable (and 409s not_ready before the mocked runner ever calls liveControl)", async () => {
    const token = "y".repeat(44);
    const runId = crypto.randomUUID();
    let release!: () => void;
    controlRunGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runRes = fetch(`${BASE}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runner: "pi",
        userInput: "daemon control test",
        control: { version: 1, runId, token },
      }),
    });

    // Headers prove registration; the explicit gate keeps this run active.
    const headersRes = await runRes;
    try {
      expect(headersRes.status).toBe(200);
      const { status, body } = await controlPost({
        version: 1,
        operation: "steer",
        runId,
        token,
        message: { id: "m1", text: "hello" },
      });
      expect(status).toBe(409);
      expect(body).toMatchObject({ ok: false });
      expect(body.error).toContain("not ready");
    } finally {
      release();
      await headersRes.text();
      controlRunGate = undefined;
    }
  });

  it("malformed JSON never echoes the raw body back", async () => {
    const r = await fetch(`${BASE}/api/coding/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"version":1,"operation":"steer","token":"leaked-secret-value"`,
    });
    expect(r.status).toBe(400);
    const text = await r.text();
    expect(text).not.toContain("leaked-secret-value");
  });
});

describe("git clone + exec", () => {
  async function post(p: string, body: unknown) {
    const r = await fetch(`${BASE}${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  it("exec with allowed subcommand (log)", async () => {
    // init a repo first
    await post("/api/git/init", { repo: "exec-test", initial_branch: "main" });
    const r = await post("/api/git/exec", {
      repo: "exec-test",
      args: ["log", "--oneline"],
    });
    // Empty repo log may fail but should not be rejected as disallowed
    expect(
      r.ok === true || r.error?.includes("does not have any commits"),
    ).toBe(true);
  });

  it("exec rejects disallowed subcommand", async () => {
    const r = await post("/api/git/exec", {
      repo: "exec-test",
      args: ["daemon"],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unsupported/i);
  });
});

describe("path safety edge cases", () => {
  async function post(p: string, body: unknown) {
    const r = await fetch(`${BASE}${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  it("rejects absolute path outside root", async () => {
    const r = await post("/api/fs/write", {
      path: "/etc/passwd",
      content: "x",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects empty path", async () => {
    const r = await post("/api/fs/write", { path: "  ", content: "x" });
    expect(r.ok).toBe(false);
  });

  it("rejects dot-dot traversal variants", async () => {
    const r = await post("/api/fs/write", {
      path: "foo/../../etc/evil",
      content: "x",
    });
    expect(r.ok).toBe(false);
  });
});

describe("yolo flag", () => {
  it("passes autoInject=false so API does not use cwd .bunny-agent", async () => {
    const before = createRunnerCalls.length;
    await fetch(`${BASE}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userInput: "autoinject", runner: "claude" }),
    });
    const call = createRunnerCalls[before];
    expect(call.autoInject).toBe(false);
  });

  it("passes yolo=true to createRunner via standalone server", async () => {
    const before = createRunnerCalls.length;
    await fetch(`${BASE}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userInput: "yolo test",
        runner: "claude",
        yolo: true,
      }),
    });
    const call = createRunnerCalls[before];
    expect(call.yolo).toBe(true);
  });

  it("passes yolo=undefined when not set", async () => {
    const before = createRunnerCalls.length;
    await fetch(`${BASE}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userInput: "no yolo", runner: "claude" }),
    });
    const call = createRunnerCalls[before];
    expect(call.yolo).toBeUndefined();
  });

  it("passes yolo=true via codingRunStream (web response)", async () => {
    const before = createRunnerCalls.length;
    const res = await codingRunStream(
      { userInput: "web yolo", yolo: true },
      {},
    );
    await res.text();
    const call = createRunnerCalls[before];
    expect(call.yolo).toBe(true);
  });
});

describe("heartbeat keepalive", () => {
  it("emits heartbeat comments during long-running tool execution (web response)", async () => {
    // Temporarily set a very short heartbeat interval so the 100ms pause
    // in __SLOW_SHORT__ triggers multiple heartbeats.
    setHeartbeatIntervalMs(20);
    try {
      const res = await codingRunStream({ userInput: "__SLOW_SHORT__" }, {});
      const text = await res.text();

      // Verify heartbeats were present (100ms pause / 20ms interval ≈ 4-5 heartbeats)
      const heartbeatCount = (text.match(/: heartbeat/g) || []).length;
      expect(heartbeatCount).toBeGreaterThanOrEqual(2);

      // Verify the actual data still came through correctly
      expect(text).toContain("tool-input-start");
      expect(text).toContain("tool-output-available");
      expect(text).toContain("[DONE]");
    } finally {
      setHeartbeatIntervalMs(15_000);
    }
  });

  it("emits heartbeat comments during long-running tool execution (standalone server)", async () => {
    setHeartbeatIntervalMs(20);
    try {
      const res = await fetch(`${BASE}/api/coding/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput: "__SLOW_SHORT__", runner: "pi" }),
      });
      const text = await res.text();

      const heartbeatCount = (text.match(/: heartbeat/g) || []).length;
      expect(heartbeatCount).toBeGreaterThanOrEqual(2);

      expect(text).toContain("tool-input-start");
      expect(text).toContain("tool-output-available");
      expect(text).toContain("[DONE]");
    } finally {
      setHeartbeatIntervalMs(15_000);
    }
  });

  it("does not emit heartbeat for fast responses (web response)", async () => {
    const res = await codingRunStream({ userInput: "fast" }, {});
    const text = await res.text();

    // Fast response should complete before any heartbeat fires
    expect(text).not.toContain(": heartbeat");
    expect(text).toContain("echo: fast");
    expect(text).toContain("[DONE]");
  });
});
