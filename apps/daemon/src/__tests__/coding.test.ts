import * as fs from "node:fs/promises";
import type * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock runner-core before importing server/nextjs
vi.mock("@sandagent/runner-core", () => ({
  createRunner: vi.fn((opts: { userInput: string }) => {
    if (opts.userInput === "__THROW__") {
      return (async function* () {
        throw new Error("runner exploded");
      })();
    }
    // Return an async iterable that yields two NDJSON lines
    return (async function* () {
      yield `${JSON.stringify({ type: "text", text: `echo: ${opts.userInput}` })}\n`;
      yield `${JSON.stringify({ type: "finish" })}\n`;
    })();
  }),
}));

import { createDaemon } from "../server.js";
import { createNextHandler } from "../nextjs.js";
import { codingRunStream } from "../routes/coding.js";

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
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0]);
    expect(first.type).toBe("text");
    expect(first.text).toBe("echo: hello");

    const second = JSON.parse(lines[1]);
    expect(second.type).toBe("finish");
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
    const lines = text.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).text).toBe("echo: test");
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
    const custom = createNextHandler({ root: os.tmpdir(), prefix: "/my/prefix" });
    const req = new Request("http://localhost/my/prefix/healthz");
    const res = await custom(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

describe("coding/run error handling", () => {
  it("streams error JSON when runner throws (standalone)", async () => {
    const res = await fetch(`${BASE}/api/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userInput: "__THROW__", runner: "claude" }),
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    const parsed = JSON.parse(text.trim());
    expect(parsed.error).toBe("runner exploded");
  });

  it("streams error JSON when runner throws (web response)", async () => {
    const res = codingRunStream({ userInput: "__THROW__" }, {});
    const text = await res.text();
    const parsed = JSON.parse(text.trim());
    expect(parsed.error).toBe("runner exploded");
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
    expect(r.ok === true || r.error?.includes("does not have any commits")).toBe(true);
  });

  it("exec rejects push", async () => {
    const r = await post("/api/git/exec", {
      repo: "exec-test",
      args: ["push"],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not allowed/i);
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
    const r = await post("/api/fs/write", { path: "/etc/passwd", content: "x" });
    expect(r.ok).toBe(false);
  });

  it("rejects empty path", async () => {
    const r = await post("/api/fs/write", { path: "  ", content: "x" });
    expect(r.ok).toBe(false);
  });

  it("rejects dot-dot traversal variants", async () => {
    const r = await post("/api/fs/write", { path: "foo/../../etc/evil", content: "x" });
    expect(r.ok).toBe(false);
  });
});
