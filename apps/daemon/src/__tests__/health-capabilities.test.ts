import * as fs from "node:fs/promises";
import type * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bunny-agent/runner-harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bunny-agent/runner-harness")>()),
  createRunner: vi.fn(() => {
    throw new Error("Health discovery must not start a runner");
  }),
}));

import { createRunner } from "@bunny-agent/runner-harness";
import { createNextHandler } from "../nextjs.js";
import { createDaemon } from "../server.js";

let root: string;
const servers: http.Server[] = [];

beforeEach(async () => {
  root = await fs.mkdtemp(
    path.join(os.tmpdir(), "daemon-health-capabilities-"),
  );
  vi.stubEnv("BUNNY_CODING_CONTROL_STATE_DIR", path.join(root, "control"));
  vi.mocked(createRunner).mockClear();
});

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

async function startTransport(kind: "standalone" | "nextjs") {
  if (kind === "nextjs") {
    const handler = createNextHandler({ root });
    return (pathname: string, init?: RequestInit) =>
      handler(new Request(`http://localhost/api/daemon${pathname}`, init));
  }
  const server = createDaemon({ host: "127.0.0.1", port: 0, root });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  return (pathname: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${address.port}${pathname}`, init);
}

const controlCapabilities = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ version: 1, operation: "capabilities" }),
};

for (const kind of ["standalone", "nextjs"] as const) {
  describe(`${kind} health discovery`, () => {
    it("reports real durable control alongside search without starting a model", async () => {
      const request = await startTransport(kind);
      const response = await request("/healthz");
      expect(response.status).toBe(200);
      const health = await response.json();
      expect(health).toMatchObject({
        ok: true,
        data: {
          status: "ok",
          root,
          volumesRoot: `${root}/volumes`,
          capabilities: {
            codingControl: { version: 1, supportedPiSteer: true },
            searchContracts: {
              pi: { version: 1, structured_retrieval: true },
              codex: { version: 1, structured_retrieval: false },
            },
          },
        },
      });
      expect((await fs.stat(path.join(root, "control"))).isDirectory()).toBe(
        true,
      );
      const legacy = await request("/api/coding/control", controlCapabilities);
      expect(await legacy.json()).toEqual(
        health.data.capabilities.codingControl,
      );
      expect(createRunner).not.toHaveBeenCalled();
    });

    it("shares one failed initialization across concurrent health and legacy probes", async () => {
      const blocked = path.join(root, "not-a-directory");
      await fs.writeFile(blocked, "blocked");
      vi.stubEnv(
        "BUNNY_CODING_CONTROL_STATE_DIR",
        path.join(blocked, "journal"),
      );
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const request = await startTransport(kind);
      const responses = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          index % 2 === 0
            ? request("/healthz")
            : request("/api/coding/control", controlCapabilities),
        ),
      );
      for (let index = 0; index < responses.length; index++) {
        expect(responses[index].status).toBe(200);
        const payload = await responses[index].json();
        if (index % 2 === 0) {
          expect(payload.ok).toBe(true);
          expect(payload.data.status).toBe("ok");
          expect(payload.data.capabilities.codingControl).toEqual({
            version: 1,
            supportedPiSteer: false,
          });
          expect(payload.data.capabilities.searchContracts.pi.version).toBe(1);
        } else {
          expect(payload).toEqual({ version: 1, supportedPiSteer: false });
        }
      }
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls[0][0]).toContain("journal unavailable");
      expect(createRunner).not.toHaveBeenCalled();
    });
  });
}
