import * as fs from "node:fs/promises";
import type * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
