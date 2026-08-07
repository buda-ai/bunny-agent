import type {
  BunnyAgentCodingRunBody,
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@bunny-agent/manager";
import { streamText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";
import type { Logger } from "../provider/types";

describe("Bunny provider SSE comments", () => {
  it("ignores heartbeat comments between data events", async () => {
    const logger = createLogger();
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([
        ": heartbeat\n\n",
        'data: {"type":"text","text":"hello"}\n\n  : heartbeat\n\n',
        'data: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
      ]),
      daemonUrl: "http://127.0.0.1:3080",
      logger,
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      prompt: "test",
    });

    await expect(result.text).resolves.toBe("hello");
    expectUnparsedStreamLineNotLogged(logger);
  });

  it("ignores a trailing heartbeat comment when the stream ends", async () => {
    const logger = createLogger();
    const bunnyAgent = createBunnyAgent({
      sandbox: createStreamingSandbox([
        'data: {"type":"finish","finishReason":"stop"}\n\n: heartbeat',
      ]),
      daemonUrl: "http://127.0.0.1:3080",
      logger,
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      prompt: "test",
    });

    await result.consumeStream();
    expectUnparsedStreamLineNotLogged(logger);
  });
});

function createLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function expectUnparsedStreamLineNotLogged(logger: Logger): void {
  for (const method of [logger.debug, logger.info, logger.warn, logger.error]) {
    expect(method).not.toHaveBeenCalledWith(
      expect.stringContaining("Unparsed stream line"),
    );
  }
}

function createStreamingSandbox(chunks: string[]): SandboxAdapter {
  const handle: SandboxHandle = {
    getSandboxId: () => null,
    getVolumes: () => null,
    getWorkdir: () => "/workspace",
    exec: async function* () {},
    upload: async () => {},
    readFile: async () => "",
    destroy: async () => {},
    streamCodingRun: async function* (
      _body: BunnyAgentCodingRunBody,
      _opts?: ExecOptions,
    ) {
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
