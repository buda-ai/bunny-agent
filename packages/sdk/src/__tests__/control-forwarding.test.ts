import type {
  BunnyAgentCodingRunBody,
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@bunny-agent/manager";
import { streamText } from "ai";
import { describe, expect, it } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";

const FINISH_CHUNK =
  'data: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n';

describe("control channel forwarding (PUL-355)", () => {
  it("forwards control onto the daemon-transport BunnyAgentCodingRunBody", async () => {
    const captured: BunnyAgentCodingRunBody[] = [];
    const bunnyAgent = createBunnyAgent({
      sandbox: createCapturingSandbox(captured, [FINISH_CHUNK]),
      daemonUrl: "http://127.0.0.1:3080",
      control: { version: 1, runId: "run-abc", token: "a".repeat(44) },
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      prompt: "steer me",
    });
    await result.consumeStream();

    expect(captured).toHaveLength(1);
    expect(captured[0].control).toEqual({
      version: 1,
      runId: "run-abc",
      token: "a".repeat(44),
    });
  });

  it("omits control entirely when the caller does not set it (no behavior change)", async () => {
    const captured: BunnyAgentCodingRunBody[] = [];
    const bunnyAgent = createBunnyAgent({
      sandbox: createCapturingSandbox(captured, [FINISH_CHUNK]),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      prompt: "hello",
    });
    await result.consumeStream();

    expect(captured).toHaveLength(1);
    expect(captured[0].control).toBeUndefined();
  });

  it("a per-call control overrides the provider-level default", async () => {
    const captured: BunnyAgentCodingRunBody[] = [];
    const bunnyAgent = createBunnyAgent({
      sandbox: createCapturingSandbox(captured, [FINISH_CHUNK]),
      daemonUrl: "http://127.0.0.1:3080",
      control: { version: 1, runId: "default-run", token: "a".repeat(44) },
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", {
        runnerType: "pi",
        control: { version: 1, runId: "call-run", token: "b".repeat(44) },
      }),
      prompt: "hello",
    });
    await result.consumeStream();

    expect(captured[0].control?.runId).toBe("call-run");
  });
});

function createCapturingSandbox(
  captured: BunnyAgentCodingRunBody[],
  chunks: string[],
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
      captured.push(body);
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
