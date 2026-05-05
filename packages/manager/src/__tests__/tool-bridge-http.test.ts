import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStandaloneHttpToolGateway } from "../tool-bridge-http.js";
import type { PendingTool, ToolBridge } from "../types.js";

const echoTool: PendingTool = {
  name: "echo",
  description: "Echo input back",
  inputSchema: { type: "object", properties: {}, required: [] },
  async execute(input, ctx) {
    return { echoed: input, sessionId: ctx.sessionId };
  },
};

const stringTool: PendingTool = {
  name: "shout",
  description: "Return a plain string",
  inputSchema: { type: "object", properties: {}, required: [] },
  async execute(input) {
    const value = (input as { word?: string } | undefined)?.word ?? "";
    return value.toUpperCase();
  },
};

const flakyTool: PendingTool = {
  name: "flaky",
  description: "Always throws",
  inputSchema: { type: "object", properties: {}, required: [] },
  async execute() {
    throw new Error("kaboom");
  },
};

describe("createStandaloneHttpToolGateway", () => {
  let gateway: Awaited<ReturnType<typeof createStandaloneHttpToolGateway>>;
  let handle: Awaited<ReturnType<typeof gateway.register>>;

  beforeEach(async () => {
    gateway = await createStandaloneHttpToolGateway({
      createToken: () => "test-token",
    });
    handle = await gateway.register({
      tools: [echoTool, stringTool, flakyTool],
      sessionId: "session-123",
    });
  });

  afterEach(async () => {
    await handle.close();
    await gateway.close();
  });

  it("dispatches by tool name and JSON-stringifies object results", async () => {
    const bridge = expectHttpBridge(handle.bridge);
    const response = await callBridge(bridge.url, bridge.token, {
      name: "echo",
      input: { hello: "world" },
    });
    expect(response.status).toBe(200);
    expect(response.body).toBe(
      JSON.stringify({
        echoed: { hello: "world" },
        sessionId: "session-123",
      }),
    );
  });

  it("returns string results verbatim", async () => {
    const bridge = expectHttpBridge(handle.bridge);
    const response = await callBridge(bridge.url, bridge.token, {
      name: "shout",
      input: { word: "hi" },
    });
    expect(response.status).toBe(200);
    expect(response.body).toBe("HI");
  });

  it("rejects missing or incorrect bearer tokens", async () => {
    const bridge = expectHttpBridge(handle.bridge);
    const response = await callBridge(bridge.url, "wrong-token", {
      name: "echo",
      input: {},
    });
    expect(response.status).toBe(401);
    expect(response.body).toBe("unauthorized");
  });

  it("returns 404 for unknown tool names", async () => {
    const bridge = expectHttpBridge(handle.bridge);
    const response = await callBridge(bridge.url, bridge.token, {
      name: "nope",
      input: {},
    });
    expect(response.status).toBe(404);
    expect(response.body).toMatch(/unknown tool/);
  });

  it("returns 500 with the thrown message", async () => {
    const bridge = expectHttpBridge(handle.bridge);
    const response = await callBridge(bridge.url, bridge.token, {
      name: "flaky",
      input: {},
    });
    expect(response.status).toBe(500);
    expect(response.body).toMatch(/kaboom/);
  });

  it("returns 400 for malformed JSON request", async () => {
    const bridge = expectHttpBridge(handle.bridge);
    const response = await fetch(bridge.url, {
      method: "POST",
      headers: { authorization: `Bearer ${bridge.token}` },
      body: "not-json",
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("invalid JSON request");
  });

  it("returns 405 for non-POST requests and 404 for wrong paths", async () => {
    const bridge = expectHttpBridge(handle.bridge);
    const getResponse = await fetch(bridge.url, {
      headers: { authorization: `Bearer ${bridge.token}` },
    });
    expect(getResponse.status).toBe(405);

    const wrongPath = new URL(bridge.url);
    wrongPath.pathname = "/wrong";
    const wrongPathResponse = await fetch(wrongPath, {
      method: "POST",
      headers: { authorization: `Bearer ${bridge.token}` },
      body: JSON.stringify({ name: "echo", input: {} }),
    });
    expect(wrongPathResponse.status).toBe(404);
  });

  it("uses publicUrl in the bridge descriptor", async () => {
    await handle.close();
    await gateway.close();
    gateway = await createStandaloneHttpToolGateway({
      publicUrl: "https://example.com/bunny-tools",
      createToken: () => "public-token",
    });
    handle = await gateway.register({
      tools: [echoTool],
    });
    expect(handle.bridge).toEqual({
      transport: "http",
      url: "https://example.com/bunny-tools",
      token: "public-token",
    });
  });

  it("close() is idempotent and drains in-flight calls", async () => {
    await handle.close();
    await gateway.close();
    let finished = false;
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    gateway = await createStandaloneHttpToolGateway({
      createToken: () => "slow-token",
    });
    handle = await gateway.register({
      tools: [
        {
          name: "slow",
          description: "Slow tool",
          inputSchema: { type: "object", properties: {}, required: [] },
          async execute() {
            startedResolve?.();
            await delay(20);
            finished = true;
            return "done";
          },
        },
      ],
    });
    const bridge = expectHttpBridge(handle.bridge);

    const request = callBridge(bridge.url, bridge.token, {
      name: "slow",
      input: {},
    });
    await started;
    await handle.close();
    await handle.close();
    const response = await request;

    expect(finished).toBe(true);
    expect(response).toEqual({ status: 200, body: "done" });
  });

  it("passes stream-level aborts to tool executors", async () => {
    await handle.close();
    await gateway.close();
    const controller = new AbortController();
    let executorSignal: AbortSignal | undefined;
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    gateway = await createStandaloneHttpToolGateway({
      createToken: () => "abort-token",
    });
    handle = await gateway.register({
      signal: controller.signal,
      tools: [
        {
          name: "wait",
          description: "Waits for abort",
          inputSchema: { type: "object", properties: {}, required: [] },
          async execute(_input, ctx) {
            executorSignal = ctx.signal;
            startedResolve?.();
            await new Promise<void>((resolve) => {
              ctx.signal.addEventListener("abort", () => resolve(), {
                once: true,
              });
            });
            return ctx.signal.aborted ? "aborted" : "not-aborted";
          },
        },
      ],
    });
    const bridge = expectHttpBridge(handle.bridge);

    const request = callBridge(bridge.url, bridge.token, {
      name: "wait",
      input: {},
    });
    await started;
    expect(executorSignal).toBe(controller.signal);
    expect(executorSignal?.aborted).toBe(false);

    controller.abort();
    const response = await request;

    expect(executorSignal?.aborted).toBe(true);
    expect(response).toEqual({ status: 200, body: "aborted" });
  });
});

function expectHttpBridge(
  bridge: ToolBridge,
): Extract<ToolBridge, { transport: "http" }> {
  expect(bridge.transport).toBe("http");
  if (bridge.transport !== "http") {
    throw new Error("expected http bridge");
  }
  return bridge;
}

async function callBridge(
  url: string,
  token: string,
  request: { name: string; input: unknown },
): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return { status: response.status, body: await response.text() };
}
