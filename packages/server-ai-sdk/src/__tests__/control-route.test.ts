import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleControlRequest,
  parseControlRequestBody,
} from "../control-route.js";
import { LiveRunRegistry } from "../live-run-registry.js";

const TOK = "a".repeat(44);

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "bunny-control-route-"));
});

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

describe("parseControlRequestBody", () => {
  it("never echoes any part of the raw body on malformed JSON, even a token substring", () => {
    const raw = `{"version":1,"operation":"steer","token":"super-secret-token-value"`; // truncated/invalid
    const result = parseControlRequestBody(raw);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.status).toBe(400);
    expect(result.envelope.error).not.toContain("super-secret-token-value");
    expect(result.envelope.error).toBe("Invalid JSON body");
  });

  it("never echoes a token hidden behind escaped quotes or unicode escapes", () => {
    const raw = `{"version":1,"operation":"steer","t\\u006fken":"leak-me"`; // escaped key, truncated
    const result = parseControlRequestBody(raw);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.envelope.error).not.toContain("leak-me");
    expect(result.envelope.error).toBe("Invalid JSON body");
  });

  it("rejects a body missing version:1", () => {
    const result = parseControlRequestBody(
      JSON.stringify({ operation: "capabilities" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown operation", () => {
    const result = parseControlRequestBody(
      JSON.stringify({ version: 1, operation: "delete-everything" }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a minimal capabilities probe", () => {
    const result = parseControlRequestBody(
      JSON.stringify({ version: 1, operation: "capabilities" }),
    );
    expect(result.ok).toBe(true);
  });

  it("empty body is a 400, not a thrown exception", () => {
    const result = parseControlRequestBody("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

describe("handleControlRequest", () => {
  it("generic capabilities probe reports supportedPiSteer:true when the journal is available", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    const result = await handleControlRequest(registry, {
      version: 1,
      operation: "capabilities",
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ version: 1, supportedPiSteer: true });
  });

  it("generic capabilities probe reports supportedPiSteer:false when durability is unavailable", async () => {
    const registry = new LiveRunRegistry({ stateDir: null });
    const result = await handleControlRequest(registry, {
      version: 1,
      operation: "capabilities",
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ version: 1, supportedPiSteer: false });
  });

  it("status on an unknown run maps ControlError('not_found') to 404", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    const result = await handleControlRequest(registry, {
      version: 1,
      operation: "status",
      runId: "missing",
      token: TOK,
    });
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ ok: false });
  });

  it("steer without a message is a 400", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const result = await handleControlRequest(registry, {
      version: 1,
      operation: "steer",
      runId: "run-1",
      token: TOK,
    });
    expect(result.status).toBe(400);
  });

  it("steer on a registered-but-not-ready run is 409", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const result = await handleControlRequest(registry, {
      version: 1,
      operation: "steer",
      runId: "run-1",
      token: TOK,
      message: { id: "m1", text: "hi" },
    });
    expect(result.status).toBe(409);
  });

  it("authenticated status returns the version-tagged status envelope", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true);
    const result = await handleControlRequest(registry, {
      version: 1,
      operation: "status",
      runId: "run-1",
      token: TOK,
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      version: 1,
      active: true,
      ready: false,
      receipts: [],
    });
  });

  it("authenticated status surfaces the configured runner/model profile", async () => {
    const registry = new LiveRunRegistry({ stateDir });
    await registry.registerRun("run-1", TOK, true, {
      runner: "pi",
      model: "gpt-5",
    });
    const result = await handleControlRequest(registry, {
      version: 1,
      operation: "status",
      runId: "run-1",
      token: TOK,
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      version: 1,
      runner: "pi",
      model: "gpt-5",
    });
  });

  it("registering a controlled run against a journal-less registry fails closed (409 unsupported), not a 200 start", async () => {
    const registry = new LiveRunRegistry({ stateDir: null });
    await expect(
      registry.registerRun("run-1", TOK, true),
    ).rejects.toMatchObject({ code: "unsupported" });
  });
});
