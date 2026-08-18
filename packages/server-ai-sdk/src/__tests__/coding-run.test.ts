import { describe, expect, it, vi } from "vitest";

const createRunnerCalls: Array<Record<string, unknown>> = [];

vi.mock("@bunny-agent/runner-harness", () => ({
  createRunner: vi.fn((opts: Record<string, unknown>) => {
    createRunnerCalls.push(opts);
    const userInput = opts.userInput as string | undefined;
    return (async function* () {
      if (userInput === "__THROW__") {
        throw new Error("runner exploded");
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
} from "../coding-run.js";

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
    const res = codingRunStream({}, {});
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Either input or userInput is required",
    });
  });

  it("streams NDJSON for a valid request", async () => {
    const res = codingRunStream({ userInput: "web" }, {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
    const text = await res.text();
    expect(text).toContain('"delta":"echo: web"');
    expect(text).toContain("data: [DONE]");
  });

  it("forwards env and request options to the runner", async () => {
    createRunnerCalls.length = 0;
    await codingRunStream(
      { userInput: "opts", runner: "pi", model: "m1", yolo: true },
      { API_KEY: "secret" },
    ).text();

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
    await codingRunStream({ userInput: "defaults" }, {}).text();

    expect(createRunnerCalls[0]).toMatchObject({
      runner: "claude",
      model: "claude-sonnet-4-20250514",
    });
  });
});
