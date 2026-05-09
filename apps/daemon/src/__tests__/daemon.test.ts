import * as fs from "node:fs/promises";
import type * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DaemonRouter } from "../router.js";
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

describe("jobs", () => {
  it("validates job creation body", async () => {
    const r = await post("/api/jobs", {
      id: "job_test_missing_kind",
      input: { prompt: "hello" },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unsupported job kind/);
  });

  it("persists failed video job when provider env is missing", async () => {
    const id = "job_test_missing_env";
    const created = await post("/api/jobs", {
      id,
      kind: "video_generation",
      input: {
        prompt: "a short test video",
        file_path: "videos/test-output.mp4",
        attachments: ["uploads/reference.png"],
      },
    });
    expect(created.ok).toBe(false);

    const synced = await post(`/api/jobs/${id}/sync`, {});
    expect(synced.ok).toBe(true);
    expect(synced.data).toMatchObject({
      id,
      kind: "video_generation",
      status: "failed",
    });
    expect(synced.data.error.message).toMatch(/ARK_API_KEY/);
  });

  it("does not persist request env in job records", async () => {
    const id = "job_test_env_not_persisted";
    const secret = "sk-test-secret";
    const created = await post("/api/jobs", {
      id,
      kind: "video_generation",
      input: {},
      env: { ARK_API_KEY: secret },
    });
    expect(created.ok).toBe(false);

    const recordText = await fs.readFile(
      path.join(root, "jobs", `${id}.json`),
      "utf8",
    );
    expect(recordText).not.toContain(secret);
    expect(JSON.parse(recordText).env).toBeUndefined();
  });

  it("uses ARK_SEEDANCE_MODEL_ID for video generation", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "ark_task_test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const router = new DaemonRouter({ root });
      const created = await router.handle("POST", "/api/jobs", {
        id: "job_test_seedance_model_env",
        kind: "video_generation",
        input: {
          prompt: "a short test video",
          file_path: "videos/model-env.mp4",
        },
        env: {
          ARK_API_KEY: "sk-test",
          ARK_SEEDANCE_MODEL_ID: "doubao-seedance-2-0-fast-260128",
          ARK_BASE_URL: "https://ark.example.test/api/v3",
        },
      });

      expect(created).toMatchObject({
        status: 200,
        body: { ok: true },
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toMatchObject({
        model: "doubao-seedance-2-0-fast-260128",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not expose a job query route", async () => {
    const r = await get("/api/jobs/job_test_missing_env");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
  });

  it("cancels a persisted job", async () => {
    const id = "job_test_cancel";
    await post("/api/jobs", {
      id,
      kind: "video_generation",
      input: {
        prompt: "a short test video",
        file_path: "videos/cancelled.mp4",
      },
    });

    const cancelled = await post(`/api/jobs/${id}/cancel`, {});
    expect(cancelled.ok).toBe(true);
    expect(cancelled.data).toMatchObject({
      id,
      kind: "video_generation",
      status: "cancelled",
    });
  });
});

describe("router", () => {
  it("dispatches static routes and dynamic job routes", async () => {
    const router = new DaemonRouter({ root });

    const staticRoute = await router.handle("GET", "/api/fs/exists", {
      path: "router-missing.txt",
    });
    expect(staticRoute).toMatchObject({
      status: 200,
      body: { ok: true, data: { exists: false } },
    });

    const now = new Date().toISOString();
    await fs.mkdir(path.join(root, "jobs"), { recursive: true });
    await fs.writeFile(
      path.join(root, "jobs", "router_job_dynamic.json"),
      JSON.stringify(
        {
          id: "router_job_dynamic",
          kind: "video_generation",
          status: "failed",
          input: {
            prompt: "router test",
            file_path: "videos/router-test.mp4",
          },
          createdAt: now,
          updatedAt: now,
        },
        null,
        2,
      ),
      "utf8",
    );

    const dynamicSync = await router.handle(
      "POST",
      "/api/jobs/router_job_dynamic/sync",
      {},
    );
    expect(dynamicSync).toMatchObject({
      status: 200,
      body: {
        ok: true,
        data: {
          id: "router_job_dynamic",
          kind: "video_generation",
          status: "failed",
        },
      },
    });

    const dynamicCancel = await router.handle(
      "POST",
      "/api/jobs/router_job_dynamic/cancel",
      {},
    );
    expect(dynamicCancel).toMatchObject({
      status: 200,
      body: {
        ok: true,
        data: {
          id: "router_job_dynamic",
          kind: "video_generation",
          status: "cancelled",
        },
      },
    });
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
