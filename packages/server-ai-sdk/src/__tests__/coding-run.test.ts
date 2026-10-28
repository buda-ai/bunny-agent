import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRunnerCalls: Array<Record<string, unknown>> = [];

vi.mock("@bunny-agent/runner-harness", () => ({
  createRunner: vi.fn((opts: Record<string, unknown>) => {
    createRunnerCalls.push(opts);
    const userInput = opts.userInput as string | undefined;
    return (async function* () {
      if (userInput === "__THROW__") {
        throw new Error("runner exploded");
      }
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
      yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
      yield `data: [DONE]\n\n`;
    })();
  }),
}));

import {
  assertRunRequestInput,
  codingRunChunks,
  codingRunStream,
  preflightControl,
} from "../coding-run.js";
import { LiveRunRegistry } from "../live-run-registry.js";

const drain = async (stream: AsyncIterable<string>): Promise<string> => {
  let out = "";
  for await (const chunk of stream) out += chunk;
  return out;
};

describe("assertRunRequestInput", () => {
  it("accepts structured input or legacy userInput", () => {
    expect(() => assertRunRequestInput({ userInput: "hi" })).not.toThrow();
    expect(() =>
      assertRunRequestInput({ input: { version: 1 } as never }),
    ).not.toThrow();
    // An empty string is still a valid text turn.
    expect(() => assertRunRequestInput({ userInput: "" })).not.toThrow();
  });

  it("rejects a request carrying neither", () => {
    expect(() => assertRunRequestInput({})).toThrow(
      /Either input or userInput is required/,
    );
  });
});

describe("codingRunChunks", () => {
  it("passes runner chunks through untouched", async () => {
    const out = await drain(
      codingRunChunks({ userInput: "hi" }, {}, new AbortController()),
    );
    expect(out).toContain('"type":"text-delta"');
    expect(out).toContain('"delta":"echo: hi"');
    expect(out.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  it("emits the SSE error envelope when the runner throws", async () => {
    const out = await drain(
      codingRunChunks({ userInput: "__THROW__" }, {}, new AbortController()),
    );
    expect(out).toBe(
      `data: ${JSON.stringify({ type: "error", errorText: "runner exploded" })}\n\n` +
        `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n` +
        `data: [DONE]\n\n`,
    );
  });

  it("reports validation failures through the same envelope", async () => {
    const out = await drain(codingRunChunks({}, {}, new AbortController()));
    expect(out).toContain('"type":"error"');
    expect(out).toContain("Either input or userInput is required");
    expect(out).toContain('"finishReason":"error"');
  });
});

describe("codingRunStream", () => {
  it("returns 400 JSON for an invalid request instead of a stream", async () => {
    const res = await codingRunStream({}, {});
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Either input or userInput is required",
    });
  });

  it("streams NDJSON for a valid request", async () => {
    const res = await codingRunStream({ userInput: "web" }, {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
    const text = await res.text();
    expect(text).toContain('"delta":"echo: web"');
    expect(text).toContain("data: [DONE]");
  });

  it("forwards env and request options to the runner", async () => {
    createRunnerCalls.length = 0;
    const res = await codingRunStream(
      { userInput: "opts", runner: "pi", model: "m1", yolo: true },
      { API_KEY: "secret" },
    );
    await res.text();

    expect(createRunnerCalls[0]).toMatchObject({
      runner: "pi",
      model: "m1",
      yolo: true,
      env: { API_KEY: "secret" },
      autoInject: false,
    });
  });

  it("defaults runner and model when unspecified", async () => {
    createRunnerCalls.length = 0;
    const res = await codingRunStream({ userInput: "defaults" }, {});
    await res.text();

    expect(createRunnerCalls[0]).toMatchObject({
      runner: "claude",
      model: "claude-sonnet-4-20250514",
    });
  });
});

describe("live control integration", () => {
  let stateDir: string;
  const TOK = "a".repeat(44);
  const TOK_2 = "b".repeat(44);

  beforeEach(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "bunny-control-coding-run-"));
  });

  afterEach(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  describe("preflightControl", () => {
    it("is a no-op without a registry or without req.control", async () => {
      const registry = new LiveRunRegistry({ stateDir });
      await expect(
        preflightControl({ userInput: "hi" }, undefined),
      ).resolves.toBeUndefined();
      await expect(
        preflightControl({ userInput: "hi" }, registry),
      ).resolves.toBeUndefined();
    });

    it("rejects a malformed control block before any provider call", async () => {
      const registry = new LiveRunRegistry({ stateDir });
      await expect(
        preflightControl(
          {
            userInput: "hi",
            control: { version: 1, runId: "", token: TOK },
          },
          registry,
        ),
      ).rejects.toMatchObject({ code: "malformed" });
    });

    it("rejects an under-entropy token before any provider call", async () => {
      const registry = new LiveRunRegistry({ stateDir });
      await expect(
        preflightControl(
          {
            userInput: "hi",
            control: { version: 1, runId: "run-short-tok", token: "short" },
          },
          registry,
        ),
      ).rejects.toMatchObject({ code: "malformed" });
    });

    it("rejects a duplicate runId before any provider call", async () => {
      const registry = new LiveRunRegistry({ stateDir });
      await registry.registerRun("dup", TOK, true);
      await expect(
        preflightControl(
          {
            userInput: "hi",
            control: { version: 1, runId: "dup", token: TOK_2 },
          },
          registry,
        ),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("fails closed (unsupported) when the registry has no durable journal, never a silent in-memory register", async () => {
      const registry = new LiveRunRegistry({ stateDir: null });
      await expect(
        preflightControl(
          {
            userInput: "hi",
            control: { version: 1, runId: "run-nodir", token: TOK },
          },
          registry,
        ),
      ).rejects.toMatchObject({ code: "unsupported" });
    });

    it("passes the effective runner/model through as the registered profile", async () => {
      const registry = new LiveRunRegistry({ stateDir });
      await preflightControl(
        {
          userInput: "hi",
          runner: "pi",
          model: "gpt-5",
          control: { version: 1, runId: "run-profile", token: TOK },
        },
        registry,
      );
      const status = await registry.getStatus("run-profile", TOK);
      expect(status).toMatchObject({ runner: "pi", model: "gpt-5" });
    });
  });

  describe("codingRunChunks + registry", () => {
    it("registers before streaming and unregisters in finally on normal completion", async () => {
      const registry = new LiveRunRegistry({ stateDir });
      const control = { version: 1 as const, runId: "run-ok", token: TOK };
      await preflightControl({ userInput: "hi", control }, registry);

      const out = await drain(
        codingRunChunks(
          { userInput: "hi", control },
          {},
          new AbortController(),
          registry,
        ),
      );
      expect(out).toContain("data: [DONE]");

      // Unregistered: a fresh (never-before-seen) id against the same runId
      // now 409s "closed" — the run genuinely existed — not a bare 404.
      await expect(
        registry.steer("run-ok", TOK, { id: "m1", text: "hi" }),
      ).rejects.toMatchObject({ code: "closed" });
    });

    it("unregisters even when the runner throws mid-stream", async () => {
      const registry = new LiveRunRegistry({ stateDir });
      const control = {
        version: 1 as const,
        runId: "run-throw",
        token: TOK,
      };
      await preflightControl({ userInput: "__THROW__", control }, registry);

      await drain(
        codingRunChunks(
          { userInput: "__THROW__", control },
          {},
          new AbortController(),
          registry,
        ),
      );

      await expect(registry.getStatus("run-throw", TOK)).resolves.toMatchObject(
        { active: false },
      );
    });

    it("wires liveControl so the runner's markReady call reaches the registry", async () => {
      const registry = new LiveRunRegistry({ stateDir });
      const control = {
        version: 1 as const,
        runId: "run-live",
        token: TOK,
      };
      await preflightControl(
        { userInput: "__LIVE_CONTROL__", runner: "pi", control },
        registry,
      );

      let readyDuringStream: boolean | undefined;
      const chunks: string[] = [];
      for await (const chunk of codingRunChunks(
        { userInput: "__LIVE_CONTROL__", runner: "pi", control },
        {},
        new AbortController(),
        registry,
      )) {
        if (readyDuringStream === undefined) {
          // The mocked runner calls `liveControl` synchronously before
          // yielding its first chunk, so markReady must have already run
          // by the time the first chunk is observed.
          readyDuringStream = (await registry.getStatus("run-live", TOK)).ready;
        }
        chunks.push(chunk);
      }

      expect(readyDuringStream).toBe(true);
    });
  });
});
