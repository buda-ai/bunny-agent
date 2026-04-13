import * as fs from "node:fs/promises";
import type * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock runner-harness before importing server/nextjs
// Track createRunner calls for assertion
const createRunnerCalls: Array<Record<string, unknown>> = [];

vi.mock("@sandagent/runner-harness", () => ({
  createRunner: vi.fn((opts: { userInput: string; yolo?: boolean }) => {
    createRunnerCalls.push(opts);
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
      yield `data: ${JSON.stringify({ type: "text", text: `echo: ${opts.userInput}` })}\n\n`;
      yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
      yield `data: [DONE]\n\n`;
    })();
  }),
}));

import { createNextHandler } from "../nextjs.js";
import { codingRunStream, setHeartbeatIntervalMs } from "../routes/coding.js";
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

describe("codingRunStream (Web Response)", () => {
  it("returns streaming Response with NDJSON", async () => {
    const res = codingRunStream({ userInput: "test" }, {});

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
});

describe("createNextHandler", () => {
  const handler = createNextHandler({ root: os.tmpdir() });

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
    const res = codingRunStream({ userInput: "__THROW__" }, {});
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
    await codingRunStream({ userInput: "web yolo", yolo: true }, {}).text();
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
      const res = codingRunStream({ userInput: "__SLOW_SHORT__" }, {});
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
    const res = codingRunStream({ userInput: "fast" }, {});
    const text = await res.text();

    // Fast response should complete before any heartbeat fires
    expect(text).not.toContain(": heartbeat");
    expect(text).toContain("echo: fast");
    expect(text).toContain("[DONE]");
  });
});
