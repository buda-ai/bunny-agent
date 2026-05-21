import * as fs from "node:fs/promises";
import type * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DaemonRouter } from "../router.js";
import { __resetSandboxProcessInspectorsForTests } from "../routes/processes.js";
import { createDaemon } from "../server.js";

const PORT = 13080;
const BASE = `http://localhost:${PORT}`;
let server: http.Server;
let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "daemon-test-"));
  server = createDaemon({ host: "127.0.0.1", port: PORT, root });
  await new Promise<void>((r) => server.listen(PORT, r));
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await fs.rm(root, { recursive: true });
});

afterEach(() => {
  __resetSandboxProcessInspectorsForTests();
});

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`);
  return r.json();
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

describe("healthz", () => {
  it("returns ok", async () => {
    const res = await get("/healthz");
    expect(res.ok).toBe(true);
    expect(res.data.status).toBe("ok");
  });
});

describe("fs", () => {
  it("write + read", async () => {
    const w = await post("/api/fs/write", {
      path: "hello.txt",
      content: "world",
    });
    expect(w.ok).toBe(true);

    const r = await get("/api/fs/read?path=hello.txt");
    expect(r.ok).toBe(true);
    expect(r.data.content).toBe("world");
  });

  it("list", async () => {
    const r = await get("/api/fs/list?path=.");
    expect(r.ok).toBe(true);
    expect(r.data.some((e: { name: string }) => e.name === "hello.txt")).toBe(
      true,
    );
  });

  it("stat", async () => {
    const r = await get("/api/fs/stat?path=hello.txt");
    expect(r.ok).toBe(true);
    expect(r.data.is_dir).toBe(false);
    expect(r.data.size).toBe(5);
    expect(
      typeof r.data.created_at === "string" || r.data.created_at === null,
    ).toBe(true);
    expect(
      typeof r.data.modified_at === "string" || r.data.modified_at === null,
    ).toBe(true);
  });

  it("exists true/false", async () => {
    const yes = await get("/api/fs/exists?path=hello.txt");
    expect(yes.data.exists).toBe(true);
    const no = await get("/api/fs/exists?path=nope.txt");
    expect(no.data.exists).toBe(false);
  });

  it("mkdir + find", async () => {
    await post("/api/fs/mkdir", { path: "subdir" });
    await post("/api/fs/write", { path: "subdir/note.txt", content: "hi" });
    const r = await get("/api/fs/find?pattern=note");
    expect(r.ok).toBe(true);
    expect(r.data.length).toBeGreaterThan(0);
  });

  it("append", async () => {
    await post("/api/fs/append", { path: "hello.txt", content: "!" });
    const r = await get("/api/fs/read?path=hello.txt");
    expect(r.data.content).toBe("world!");
  });

  it("copy + move + remove", async () => {
    await post("/api/fs/copy", { from: "hello.txt", to: "copy.txt" });
    const c = await get("/api/fs/read?path=copy.txt");
    expect(c.data.content).toBe("world!");

    await post("/api/fs/move", { from: "copy.txt", to: "moved.txt" });
    expect((await get("/api/fs/exists?path=copy.txt")).data.exists).toBe(false);
    expect((await get("/api/fs/exists?path=moved.txt")).data.exists).toBe(true);

    await post("/api/fs/remove", { path: "moved.txt" });
    expect((await get("/api/fs/exists?path=moved.txt")).data.exists).toBe(
      false,
    );
  });

  it("rejects path traversal", async () => {
    const r = await post("/api/fs/write", {
      path: "../../etc/evil",
      content: "x",
    });
    expect(r.ok).toBe(false);
  });
});

describe("fs write-from-url", () => {
  const payload = Buffer.from("hello-from-upstream");
  let upstream: http.Server;
  let upstreamPort: number;
  let upstreamRequests = 0;
  let slowResolvers: Array<() => void> = [];

  beforeAll(async () => {
    const mod = await import("node:http");
    upstream = mod.createServer((req, res) => {
      upstreamRequests++;
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/bytes") {
        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Content-Length": payload.length,
        });
        res.end(payload);
        return;
      }
      if (url.pathname === "/slow") {
        res.writeHead(200, { "Content-Type": "video/mp4" });
        res.write(payload.subarray(0, 4));
        slowResolvers.push(() => {
          res.write(payload.subarray(4));
          res.end();
        });
        return;
      }
      if (url.pathname === "/404") {
        res.writeHead(404);
        res.end("nope");
        return;
      }
      res.writeHead(500);
      res.end();
    });
    await new Promise<void>((r) => upstream.listen(0, r));
    const addr = upstream.address();
    if (!addr || typeof addr === "string") throw new Error("no upstream port");
    upstreamPort = addr.port;
  });

  afterAll(async () => {
    for (const r of slowResolvers) r();
    slowResolvers = [];
    await new Promise<void>((r) => upstream.close(() => r()));
  });

  it("streams remote body into target file", async () => {
    upstreamRequests = 0;
    const r = await post("/api/fs/write-from-url", {
      path: "downloads/clip.mp4",
      url: `http://127.0.0.1:${upstreamPort}/bytes`,
    });
    expect(r.ok).toBe(true);
    expect(r.data.size).toBe(payload.length);
    expect(r.data.contentType).toBe("video/mp4");
    expect(upstreamRequests).toBe(1);

    const written = await fs.readFile(path.join(root, "downloads", "clip.mp4"));
    expect(written.equals(payload)).toBe(true);
  });

  it("cleans up tmp file and returns error on 404", async () => {
    const r = await post("/api/fs/write-from-url", {
      path: "downloads/missing.mp4",
      url: `http://127.0.0.1:${upstreamPort}/404`,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/download failed: 404/);

    const entries = await fs.readdir(path.join(root, "downloads"));
    expect(entries.some((name) => name.includes(".part"))).toBe(false);
    expect(entries.includes("missing.mp4")).toBe(false);
  });

  it("rejects non-http/https URL", async () => {
    const r = await post("/api/fs/write-from-url", {
      path: "downloads/reject.mp4",
      url: "ftp://example.com/file.mp4",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unsupported url protocol/);
  });

  it("rejects path traversal in write-from-url", async () => {
    const r = await post("/api/fs/write-from-url", {
      path: "../../etc/evil.mp4",
      url: `http://127.0.0.1:${upstreamPort}/bytes`,
    });
    expect(r.ok).toBe(false);
  });

  it("aborts slow download when idle timeout elapses", async () => {
    const pending = post("/api/fs/write-from-url", {
      path: "downloads/slow.mp4",
      url: `http://127.0.0.1:${upstreamPort}/slow`,
      idle_timeout_ms: 1000,
      timeout_ms: 5000,
    });
    const r = await pending;
    // After idle timeout fires, upstream is not resolved yet — flush so afterAll can close.
    for (const resolve of slowResolvers) resolve();
    slowResolvers = [];
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/aborted|write-from-url failed/);

    const entries = await fs.readdir(path.join(root, "downloads"));
    expect(entries.some((name) => name.includes(".part"))).toBe(false);
  });
});

describe("volumes", () => {
  it("ensure + list + remove", async () => {
    await post("/api/volumes/ensure", { volume: "vol-001" });
    const list = await get("/api/volumes/list");
    expect(list.data.volumes).toContain("vol-001");

    await post("/api/volumes/remove", { volume: "vol-001" });
    const after = await get("/api/volumes/list");
    expect(after.data.volumes).not.toContain("vol-001");
  });
});

describe("router", () => {
  it("dispatches static routes only", async () => {
    const router = new DaemonRouter({ root });

    const staticRoute = await router.handle("GET", "/api/fs/exists", {
      path: "router-missing.txt",
    });
    expect(staticRoute).toMatchObject({
      status: 200,
      body: { ok: true, data: { exists: false } },
    });

    const dynamicRoute = await router.handle(
      "POST",
      "/api/fs/exists/not-a-route",
      {},
    );
    expect(dynamicRoute).toBeNull();
  });
});

describe("git", () => {
  it("init + status", async () => {
    const init = await post("/api/git/init", {
      repo: "myrepo",
      initial_branch: "main",
    });
    expect(init.ok).toBe(true);

    const status = await post("/api/git/status", { repo: "myrepo" });
    expect(status.ok).toBe(true);
    expect(status.data.stdout).toContain("main");
  });

  it("exec add + commit + log + ls-files", async () => {
    await post("/api/git/init", {
      repo: "history-repo",
      initial_branch: "main",
    });
    await post("/api/fs/write", {
      path: "history-repo/readme.md",
      content: "# History\n",
    });

    const add = await post("/api/git/exec", {
      repo: "history-repo",
      args: ["add", "readme.md"],
    });
    expect(add.ok).toBe(true);
    expect(add.data.code).toBe(0);

    const commit = await post("/api/git/exec", {
      repo: "history-repo",
      args: ["commit", "-m", "Add readme"],
    });
    expect(commit.ok).toBe(true);
    expect(commit.data.code).toBe(0);

    const log = await post("/api/git/exec", {
      repo: "history-repo",
      args: ["log", "--oneline"],
    });
    expect(log.ok).toBe(true);
    expect(log.data.stdout).toContain("Add readme");

    const files = await post("/api/git/exec", {
      repo: "history-repo",
      args: ["ls-files"],
    });
    expect(files.ok).toBe(true);
    expect(files.data.stdout).toContain("readme.md");
  });

  it("rejects unknown git subcommand", async () => {
    const r = await post("/api/git/exec", { repo: "myrepo", args: ["daemon"] });
    expect(r.ok).toBe(false);
  });
});

describe("404", () => {
  it("unknown route", async () => {
    const r = await get("/api/nope");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
  });
});
