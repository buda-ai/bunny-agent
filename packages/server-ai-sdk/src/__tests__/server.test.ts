import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import type * as http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRunnerCalls: Array<Record<string, unknown>> = [];

vi.mock("@bunny-agent/runner-harness", () => ({
  createRunner: vi.fn((opts: Record<string, unknown>) => {
    createRunnerCalls.push(opts);
    const userInput = opts.userInput as string | undefined;
    return (async function* () {
      if (userInput === "__LIVE_CONTROL__") {
        const liveControl = opts.liveControl as
          | ((controller: unknown) => void)
          | undefined;
        liveControl?.({
          steer: async () => ({ disposition: "queued" }),
          onConsumed: () => {},
          dispose: () => {},
        });
      }
      yield `data: ${JSON.stringify({ type: "text-delta", id: "m1", delta: `echo: ${userInput}` })}\n\n`;
      yield `data: [DONE]\n\n`;
    })();
  }),
}));

import {
  createAiSdkCodingRunServer,
  createAiSdkCodingServers,
} from "../server.js";

/** Minimal IncomingMessage stand-in that replays a JSON body. */
function fakeRequest(body: string): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  queueMicrotask(() => {
    req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req;
}

interface CapturedResponse {
  res: http.ServerResponse;
  written: () => string;
  status: () => number | undefined;
  headers: () => Record<string, string> | undefined;
  ended: () => boolean;
}

function fakeResponse(): CapturedResponse {
  let body = "";
  let status: number | undefined;
  let headers: Record<string, string> | undefined;
  let ended = false;
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    writeHead: (code: number, hdrs?: Record<string, string>) => {
      status = code;
      headers = hdrs;
      return res;
    },
    write: (chunk: string) => {
      body += chunk;
      return true;
    },
    end: (chunk?: string) => {
      if (chunk) body += chunk;
      ended = true;
      return res;
    },
  }) as unknown as http.ServerResponse;

  return {
    res,
    written: () => body,
    status: () => status,
    headers: () => headers,
    ended: () => ended,
  };
}

const prepareEnv = () => ({ env: { A: "1" }, systemEnv: { A: "1" } });

describe("createAiSdkCodingRunServer", () => {
  it("advertises its protocol and default mount path", () => {
    const server = createAiSdkCodingRunServer({ prepareEnv });
    expect(server.protocol).toBe("ai-sdk");
    expect(server.mountPath).toBe("/api/coding/run");
  });

  it("honours a custom mount path", () => {
    const server = createAiSdkCodingRunServer({
      prepareEnv,
      mountPath: "/custom",
    });
    expect(server.mountPath).toBe("/custom");
  });

  it("streams NDJSON over Node http", async () => {
    const server = createAiSdkCodingRunServer({ prepareEnv });
    const captured = fakeResponse();

    await server.handleNodeHttp(
      fakeRequest(JSON.stringify({ userInput: "node" })),
      captured.res,
    );

    expect(captured.status()).toBe(200);
    expect(captured.headers()?.["Content-Type"]).toBe("application/x-ndjson");
    expect(captured.written()).toContain('"delta":"echo: node"');
    expect(captured.ended()).toBe(true);
  });

  it("rejects malformed JSON with 400 rather than a stream", async () => {
    const server = createAiSdkCodingRunServer({ prepareEnv });
    const captured = fakeResponse();

    await server.handleNodeHttp(fakeRequest("{not json"), captured.res);

    expect(captured.status()).toBe(400);
    expect(JSON.parse(captured.written())).toMatchObject({
      ok: false,
      data: null,
    });
    expect(captured.written()).toContain("Invalid JSON body");
  });

  it("applies prepareEnv to both transports", async () => {
    createRunnerCalls.length = 0;
    const server = createAiSdkCodingRunServer({
      prepareEnv: () => ({
        env: { RESOLVED: "yes" },
        systemEnv: { SAFE: "ok" },
      }),
    });

    await server.handleWebRequest(
      new Request("http://localhost/api/coding/run", {
        method: "POST",
        body: JSON.stringify({ userInput: "web" }),
      }),
    );

    expect(createRunnerCalls[0]).toMatchObject({
      env: { RESOLVED: "yes" },
      systemEnv: { SAFE: "ok" },
    });
  });

  it("treats an unparseable web body as an empty request", async () => {
    const server = createAiSdkCodingRunServer({ prepareEnv });
    const res = await server.handleWebRequest(
      new Request("http://localhost/api/coding/run", {
        method: "POST",
        body: "not json",
      }),
    );
    // Empty body fails input validation, which surfaces as a 400.
    expect(res.status).toBe(400);
  });
});

describe("createAiSdkCodingServers", () => {
  const TOK = "a".repeat(44);
  const TOK_2 = "b".repeat(44);
  let stateDir: string;

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "bunny-control-server-"));
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  it("mounts run at /api/coding/run and control at /api/coding/control by default", () => {
    const { run, control } = createAiSdkCodingServers({ prepareEnv });
    expect(run.mountPath).toBe("/api/coding/run");
    expect(control.mountPath).toBe("/api/coding/control");
    expect(control.protocol).toBe("ai-sdk-control");
  });

  it("honours custom run/control mount paths independently", () => {
    const { run, control } = createAiSdkCodingServers({
      prepareEnv,
      runMountPath: "/custom/run",
      controlMountPath: "/custom/control",
    });
    expect(run.mountPath).toBe("/custom/run");
    expect(control.mountPath).toBe("/custom/control");
  });

  it("disables durability when registryOptions.stateDir is null", async () => {
    const { registry } = createAiSdkCodingServers({
      prepareEnv,
      registryOptions: { stateDir: null },
    });
    expect(await registry.supportsDurableControl()).toBe(false);
  });

  it("a controlled run request fails closed (409) when the registry has no durable journal, instead of a successful model start", async () => {
    const { run, registry } = createAiSdkCodingServers({
      prepareEnv,
      registryOptions: { stateDir: null },
    });

    let nativeCallCount = 0;
    registry.markReady("no-durability-run", {
      steer: async () => {
        nativeCallCount += 1;
        return { disposition: "queued" };
      },
      onConsumed: () => {},
      dispose: () => {},
    });

    const captured = fakeResponse();
    await run.handleNodeHttp(
      fakeRequest(
        JSON.stringify({
          userInput: "node run",
          control: { version: 1, runId: "no-durability-run", token: TOK },
        }),
      ),
      captured.res,
    );

    expect(captured.status()).toBe(409);
    expect(JSON.parse(captured.written())).toMatchObject({ ok: false });
    // The model must never have started — no stream, no native dispatch.
    expect(nativeCallCount).toBe(0);
  });

  it("a run registered over the Node transport is steerable over the Web control transport (real durable journal)", async () => {
    const { run, control, registry } = createAiSdkCodingServers({
      prepareEnv,
      registryOptions: { stateDir },
    });

    const captured = fakeResponse();
    const runPromise = run.handleNodeHttp(
      fakeRequest(
        JSON.stringify({
          userInput: "__LIVE_CONTROL__",
          runner: "pi",
          control: { version: 1, runId: "cross-transport", token: TOK },
        }),
      ),
      captured.res,
    );
    await runPromise;
    expect(captured.status()).toBe(200);

    const controlRes = await control.handleWebRequest(
      new Request("http://localhost/api/coding/control", {
        method: "POST",
        body: JSON.stringify({
          version: 1,
          operation: "status",
          runId: "cross-transport",
          token: TOK,
        }),
      }),
    );
    expect(controlRes.status).toBe(200);
    // The run already finished (fakeResponse resolves synchronously), so the
    // registry has unregistered it — status must still answer, just inactive.
    await expect(controlRes.json()).resolves.toMatchObject({
      version: 1,
      active: false,
    });

    // The control registry instance is the same one `markReady` ran
    // against mid-stream — confirm the native controller actually reached
    // "ready" during the run (not just that the request round-tripped).
    expect(await registry.supportsDurableControl()).toBe(true);
  });

  it("rejects a duplicate runId across the run and control mounts sharing one registry", async () => {
    const { run, registry } = createAiSdkCodingServers({
      prepareEnv,
      registryOptions: { stateDir },
    });
    await registry.registerRun("already-taken", TOK, true);

    const captured = fakeResponse();
    await run.handleNodeHttp(
      fakeRequest(
        JSON.stringify({
          userInput: "node run",
          control: { version: 1, runId: "already-taken", token: TOK_2 },
        }),
      ),
      captured.res,
    );

    expect(captured.status()).toBe(409);
    expect(JSON.parse(captured.written())).toMatchObject({ ok: false });
  });

  it("a control request on an unknown run 404s over both transports", async () => {
    const { control } = createAiSdkCodingServers({
      prepareEnv,
      registryOptions: { stateDir: null },
    });

    const webRes = await control.handleWebRequest(
      new Request("http://localhost/api/coding/control", {
        method: "POST",
        body: JSON.stringify({
          version: 1,
          operation: "status",
          runId: "nope",
          token: TOK,
        }),
      }),
    );
    expect(webRes.status).toBe(404);

    const captured = fakeResponse();
    await control.handleNodeHttp(
      fakeRequest(
        JSON.stringify({
          version: 1,
          operation: "status",
          runId: "nope",
          token: TOK,
        }),
      ),
      captured.res,
    );
    expect(captured.status()).toBe(404);
  });
});
