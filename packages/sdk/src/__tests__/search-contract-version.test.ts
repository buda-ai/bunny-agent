import type {
  BunnyAgentCodingRunBody,
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@bunny-agent/manager";
import { generateText, streamText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";
import type { Logger } from "../provider/types";

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createStreamingSandbox(
  chunks: string[],
  captured: { body?: BunnyAgentCodingRunBody } = {},
): SandboxAdapter {
  const handle: SandboxHandle = {
    getSandboxId: () => null,
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec: async function* () {},
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
    streamCodingRun: async function* (
      body: BunnyAgentCodingRunBody,
      _opts?: ExecOptions,
    ) {
      captured.body = body;
      for (const chunk of chunks) {
        yield new TextEncoder().encode(chunk);
      }
    },
  };

  return {
    attach: async () => handle,
    getHandle: () => handle,
    getWorkdir: () => "/workspace",
  };
}

const ACK_CHUNK =
  'data: {"type":"message-metadata","messageMetadata":{"searchContract":{"version":1,"structured_retrieval":true,"native_annotations":false,"explicit_source_marker_annotations":true}}}\n\n';
const TEXT_CHUNK = 'data: {"type":"text","text":"hello"}\n\n';
const FINISH_CHUNK =
  'data: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n';

describe("SDK searchContractVersion forwarding", () => {
  it("forwards explicit approval bypass to CLI while preserving unspecified defaults and model overrides", async () => {
    for (const test of [
      { defaultYolo: undefined, modelYolo: undefined, expected: false },
      { defaultYolo: true, modelYolo: undefined, expected: true },
      { defaultYolo: true, modelYolo: false, expected: false },
      { defaultYolo: false, modelYolo: true, expected: true },
    ]) {
      const sandbox = createStreamingSandbox([]);
      let command: string[] = [];
      const handle = sandbox.getHandle!()!;
      handle.exec = async function* (args) {
        command = args;
        yield new TextEncoder().encode(ACK_CHUNK + FINISH_CHUNK);
      };
      const model = createBunnyAgent({
        sandbox,
        yolo: test.defaultYolo,
        logger: createLogger(),
      })("gpt-5", {
        runnerType: "pi",
        searchContractVersion: 1,
        yolo: test.modelYolo,
      });
      const response = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
      });
      const reader = response.stream.getReader();
      while (!(await reader.read()).done) {
        /* Drain the CLI fixture. */
      }
      expect(command.includes("--yolo")).toBe(test.expected);
      expect(command[command.indexOf("--search-contract-version") + 1]).toBe(
        "1",
      );
    }
  });

  it("includes searchContractVersion in the daemon request body when set on the runner spec", async () => {
    const captured: { body?: BunnyAgentCodingRunBody } = {};
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox(
        [ACK_CHUNK, TEXT_CHUNK, FINISH_CHUNK],
        captured,
      ),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("gpt-5", {
        runnerType: "pi",
        searchContractVersion: 1,
      }),
      prompt: "test",
    });

    await result.consumeStream();
    expect(captured.body?.searchContractVersion).toBe(1);
  });

  it("omits searchContractVersion from the request body when unset (legacy unchanged)", async () => {
    const captured: { body?: BunnyAgentCodingRunBody } = {};
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([TEXT_CHUNK, FINISH_CHUNK], captured),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("gpt-5", { runnerType: "pi" }),
      prompt: "test",
    });

    await result.consumeStream();
    expect(captured.body?.searchContractVersion).toBeUndefined();
  });
});

describe("SDK searchContractVersion acknowledgement", () => {
  it("surfaces the acknowledged capabilities on finish providerMetadata", async () => {
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([ACK_CHUNK, TEXT_CHUNK, FINISH_CHUNK]),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("gpt-5", {
        runnerType: "pi",
        searchContractVersion: 1,
      }),
      prompt: "test",
    });

    await result.consumeStream();
    const providerMetadata = await result.providerMetadata;
    expect(
      (providerMetadata?.["bunny-agent"] as Record<string, unknown>)
        ?.searchContract,
    ).toEqual({
      version: 1,
      structured_retrieval: true,
      native_annotations: false,
      explicit_source_marker_annotations: true,
    });
  });

  it("surfaces Codex's honest query-only acknowledgement (no structured retrieval or citation bridge)", async () => {
    const CODEX_ACK_CHUNK =
      'data: {"type":"message-metadata","messageMetadata":{"searchContract":{"version":1,"structured_retrieval":false,"native_annotations":false,"explicit_source_marker_annotations":false}}}\n\n';
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([
        CODEX_ACK_CHUNK,
        TEXT_CHUNK,
        FINISH_CHUNK,
      ]),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("gpt-5-codex", {
        runnerType: "codex",
        searchContractVersion: 1,
      }),
      prompt: "test",
    });

    await result.consumeStream();
    const providerMetadata = await result.providerMetadata;
    expect(
      (providerMetadata?.["bunny-agent"] as Record<string, unknown>)
        ?.searchContract,
    ).toEqual({
      version: 1,
      structured_retrieval: false,
      native_annotations: false,
      explicit_source_marker_annotations: false,
    });
  });

  it("rejects an explicit v1 request that completes without any acknowledgement (older peer)", async () => {
    const logger = createLogger();
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([TEXT_CHUNK, FINISH_CHUNK]),
      daemonUrl: "http://127.0.0.1:3080",
      logger,
    });

    const result = streamText({
      model: bunnyAgent("gpt-5", {
        runnerType: "pi",
        searchContractVersion: 1,
      }),
      prompt: "test",
    });

    await expect(result.consumeStream()).resolves.toBeUndefined();
    const finishReason = await result.finishReason;
    expect(finishReason).toBe("error");
  });

  it("does not require an acknowledgement when searchContractVersion is unset", async () => {
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([TEXT_CHUNK, FINISH_CHUNK]),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("gpt-5", { runnerType: "pi" }),
      prompt: "test",
    });

    await expect(result.text).resolves.toBe("hello");
    const finishReason = await result.finishReason;
    expect(finishReason).toBe("stop");
  });

  it("rejects an explicit v1 request whose stream ends prematurely (EOF) without ever reaching a finish chunk, instead of stalling or silently succeeding", async () => {
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([TEXT_CHUNK]),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("gpt-5", {
        runnerType: "pi",
        searchContractVersion: 1,
      }),
      prompt: "test",
    });

    await expect(result.consumeStream()).resolves.toBeUndefined();
    const finishReason = await result.finishReason;
    expect(finishReason).toBe("error");
  });

  it("rejects an explicit v1 request when the acknowledgement payload is malformed (wrong shape), treating it the same as a missing acknowledgement", async () => {
    const MALFORMED_ACK_CHUNK =
      'data: {"type":"message-metadata","messageMetadata":{"searchContract":{"version":1,"structured_retrieval":"yes"}}}\n\n';
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([
        MALFORMED_ACK_CHUNK,
        TEXT_CHUNK,
        FINISH_CHUNK,
      ]),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("gpt-5", {
        runnerType: "pi",
        searchContractVersion: 1,
      }),
      prompt: "test",
    });

    await expect(result.consumeStream()).resolves.toBeUndefined();
    const finishReason = await result.finishReason;
    expect(finishReason).toBe("error");
  });

  it("does not reject when the harness explicitly errors the request (handled by the existing error path, not the ack-missing path)", async () => {
    const errorText =
      'Runner "claude" does not support searchContractVersion 1.';
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([
        `data: ${JSON.stringify({ type: "error", errorText })}\n\n`,
        'data: {"type":"finish","finishReason":"error"}\n\ndata: [DONE]\n\n',
      ]),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = generateText({
      model: bunnyAgent("gpt-5", {
        runnerType: "claude",
        searchContractVersion: 1,
      }),
      prompt: "test",
    });

    await expect(result).resolves.toMatchObject({
      finishReason: "error",
      text: errorText,
    });
  });

  it("retains effective capabilities on an acknowledged premature EOF error finish", async () => {
    const model = createBunnyAgent({
      sandbox: createStreamingSandbox([ACK_CHUNK, TEXT_CHUNK]),
      daemonUrl: "http://127.0.0.1:3080",
    })("gpt-5", { runnerType: "pi", searchContractVersion: 1 });
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }],
    });
    expect(result.finishReason).toEqual({
      unified: "error",
      raw: "unexpected-stream-end",
    });
    expect(result.providerMetadata?.["bunny-agent"]?.searchContract).toEqual({
      version: 1,
      structured_retrieval: true,
      native_annotations: false,
      explicit_source_marker_annotations: true,
    });
  });
});
