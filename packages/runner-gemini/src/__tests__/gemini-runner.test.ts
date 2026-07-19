/**
 * Unit tests for the Gemini ACP runner using a mocked subprocess.
 */

import { PassThrough, Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiRunner } from "../gemini-runner.js";

interface FakeProcess {
  stdin: Writable;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: () => void;
  requests: Array<{
    id?: number;
    method: string;
    params: { sessionId?: string };
  }>;
}

let fakeProcess: FakeProcess;
let agentCapabilities: Record<string, unknown> = {};

function respond(id: number, result: unknown) {
  fakeProcess.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`,
  );
}

function notify(method: string, params: unknown) {
  fakeProcess.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`,
  );
}

vi.mock("node:child_process", () => ({
  spawn: () => {
    const stdout = new PassThrough();
    const requests: FakeProcess["requests"] = [];
    const stdin = new Writable({
      write(chunk, _enc, cb) {
        const msg = JSON.parse(chunk.toString());
        requests.push(msg);
        // Auto-drive the ACP handshake.
        if (msg.method === "initialize") {
          respond(msg.id, { protocolVersion: 1, agentCapabilities });
        } else if (msg.method === "session/new") {
          respond(msg.id, { sessionId: "sess-new-123" });
        } else if (msg.method === "session/load") {
          // Replay one historical chunk before completing the load.
          notify("session/update", {
            sessionId: msg.params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "old history" },
            },
          });
          respond(msg.id, null as unknown);
        } else if (msg.method === "session/prompt") {
          notify("session/update", {
            sessionId: msg.params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: "hello from agent" },
            },
          });
          respond(msg.id, { stopReason: "end_turn" });
        }
        cb();
      },
    });
    fakeProcess = {
      stdin,
      stdout,
      stderr: new PassThrough(),
      kill: () => stdout.end(),
      requests,
    };
    return fakeProcess;
  },
}));

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of iter) chunks.push(chunk);
  return chunks;
}

function parsed(
  chunks: string[],
): Array<Record<string, string> & { messageMetadata?: { sessionId: string } }> {
  return chunks
    .filter((c) => c.startsWith("data: {"))
    .map((c) => JSON.parse(c.slice("data: ".length)));
}

describe("createGeminiRunner", () => {
  beforeEach(() => {
    agentCapabilities = {};
  });

  it("emits message-metadata with the sessionId from session/new", async () => {
    const runner = createGeminiRunner({ cwd: "/tmp" });
    const events = parsed(await collect(runner.run("hi")));

    const metadata = events.find((e) => e.type === "message-metadata");
    expect(metadata).toBeDefined();
    expect(metadata?.messageMetadata?.sessionId).toBe("sess-new-123");

    // Metadata must come after start and before any text.
    const types = events.map((e) => e.type);
    expect(types.indexOf("start")).toBeLessThan(
      types.indexOf("message-metadata"),
    );
    expect(events.some((e) => e.type === "text-delta")).toBe(true);
    expect(events.at(-1)?.type).toBe("finish");
  });

  it("creates a new session when resume is set but loadSession is unsupported", async () => {
    const runner = createGeminiRunner({ cwd: "/tmp", resume: "sess-old" });
    const events = parsed(await collect(runner.run("hi")));

    expect(fakeProcess.requests.some((r) => r.method === "session/load")).toBe(
      false,
    );
    const metadata = events.find((e) => e.type === "message-metadata");
    expect(metadata?.messageMetadata?.sessionId).toBe("sess-new-123");
  });

  it("loads the session and skips replayed history when resuming", async () => {
    agentCapabilities = { loadSession: true };
    const runner = createGeminiRunner({ cwd: "/tmp", resume: "sess-old" });
    const events = parsed(await collect(runner.run("hi")));

    const load = fakeProcess.requests.find((r) => r.method === "session/load");
    expect(load?.params.sessionId).toBe("sess-old");
    expect(fakeProcess.requests.some((r) => r.method === "session/new")).toBe(
      false,
    );

    const metadata = events.find((e) => e.type === "message-metadata");
    expect(metadata?.messageMetadata?.sessionId).toBe("sess-old");

    const deltas = events
      .filter((e) => e.type === "text-delta")
      .map((e) => e.delta);
    expect(deltas).toEqual(["hello from agent"]);
  });
});
