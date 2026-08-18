import { EventEmitter } from "node:events";
import type * as http from "node:http";
import { describe, expect, it, vi } from "vitest";

const createRunnerCalls: Array<Record<string, unknown>> = [];

vi.mock("@bunny-agent/runner-harness", () => ({
  createRunner: vi.fn((opts: Record<string, unknown>) => {
    createRunnerCalls.push(opts);
    return (async function* () {
      yield `data: ${JSON.stringify({ type: "text-delta", id: "m1", delta: `echo: ${opts.userInput}` })}\n\n`;
      yield `data: [DONE]\n\n`;
    })();
  }),
}));

import { createAiSdkCodingRunServer } from "../server.js";

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
