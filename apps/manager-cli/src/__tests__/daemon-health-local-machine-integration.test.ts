import type { Server } from "node:http";
import * as http from "node:http";
import { isBunnyAgentDaemonHealthy } from "@bunny-agent/manager";
import { LocalMachine } from "@bunny-agent/sandbox-local";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Real integration tests for `isBunnyAgentDaemonHealthy` — NOT a mock of
 * `handle.exec`, NOT a mocked HTTP layer. These spin up a real Node `http`
 * server on loopback and probe it through a real `LocalMachine`, which spawns
 * a real `curl` child process (see `LocalMachineHandle.exec` in
 * `@bunny-agent/sandbox-local`). This exercises the full real path the SDK
 * fix in `packages/manager/src/daemon-health.ts` is meant to harden:
 * real process spawn, real curl exit codes/HTTP statuses, real
 * AbortController-driven process teardown via `killProcessTree`.
 */
describe("isBunnyAgentDaemonHealthy against a real LocalMachine + real HTTP server", () => {
  let server: Server | undefined;
  let sandbox: LocalMachine | undefined;

  afterEach(async () => {
    // `server?.close(() => resolve())` would never call `resolve()` when
    // `server` is undefined (optional chaining short-circuits the whole
    // expression without invoking the callback) — hanging this hook forever
    // for any test that never calls `startServer()`.
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    server = undefined;
    sandbox = undefined;
  });

  function startServer(handler: http.RequestListener): Promise<string> {
    return new Promise((resolve) => {
      server = http.createServer(handler);
      server.listen(0, "127.0.0.1", () => {
        const address = server?.address();
        if (!address || typeof address === "string") {
          throw new Error("expected a real listening TCP address");
        }
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
  }

  it("returns true when the real server answers /healthz with 200", async () => {
    const baseUrl = await startServer((req, res) => {
      if (req.url === "/healthz") {
        res.writeHead(200);
        res.end("ok");
        return;
      }
      res.writeHead(404);
      res.end();
    });
    sandbox = new LocalMachine();
    const handle = await sandbox.attach();

    const healthy = await isBunnyAgentDaemonHealthy(handle, baseUrl, {
      timeout: 3_000,
    });
    expect(healthy).toBe(true);
  }, 10_000);

  it("returns false when the real server answers /healthz with a non-200 status", async () => {
    const baseUrl = await startServer((_req, res) => {
      res.writeHead(503);
      res.end("not ready");
    });
    sandbox = new LocalMachine();
    const handle = await sandbox.attach();

    const healthy = await isBunnyAgentDaemonHealthy(handle, baseUrl, {
      timeout: 3_000,
    });
    expect(healthy).toBe(false);
  }, 10_000);

  it("returns false (connection refused) when nothing is listening on the target port", async () => {
    sandbox = new LocalMachine();
    const handle = await sandbox.attach();

    // Port 1 is a real, reserved, never-listening TCP port on loopback — curl
    // gets a genuine ECONNREFUSED from the real kernel, not a simulated one.
    const healthy = await isBunnyAgentDaemonHealthy(
      handle,
      "http://127.0.0.1:1",
      {
        timeout: 3_000,
      },
    );
    expect(healthy).toBe(false);
  }, 10_000);

  it("retries across real attempts and succeeds once the real server starts responding 200", async () => {
    let requestCount = 0;
    const baseUrl = await startServer((_req, res) => {
      requestCount += 1;
      if (requestCount < 2) {
        res.writeHead(503);
        res.end("warming up");
        return;
      }
      res.writeHead(200);
      res.end("ok");
    });
    sandbox = new LocalMachine();
    const handle = await sandbox.attach();

    const healthy = await isBunnyAgentDaemonHealthy(handle, baseUrl, {
      timeout: 2_000,
      maxAttempts: 3,
      delayMs: 50,
    });
    expect(healthy).toBe(true);
    expect(requestCount).toBeGreaterThanOrEqual(2);
  }, 15_000);

  it("does not leave an orphaned curl process running past a real abort", async () => {
    // A server that accepts the connection but never responds — curl must be
    // genuinely killed by the real AbortController -> killProcessTree path in
    // LocalMachineHandle.exec, not merely have its promise resolve.
    const baseUrl = await startServer(() => {
      // Never calls res.end() — the request hangs until the client gives up.
    });
    sandbox = new LocalMachine();
    const handle = await sandbox.attach();

    const controller = new AbortController();
    const probePromise = isBunnyAgentDaemonHealthy(handle, baseUrl, {
      timeout: 5_000,
      signal: controller.signal,
    });

    // Abort shortly after issuing the probe, well before curl's own
    // --max-time would fire on its own.
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();

    const healthy = await probePromise;
    expect(healthy).toBe(false);
  }, 10_000);
});
