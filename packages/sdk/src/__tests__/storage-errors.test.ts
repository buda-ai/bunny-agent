import type {
  BunnyAgentCodingRunBody,
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@bunny-agent/manager";
import { streamText } from "ai";
import { describe, expect, it } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";
import { BunnyAgentStreamError } from "../provider/errors";

describe("BunnyAgent storage errors", () => {
  it("restores a structured daemon error as a typed SDK error", async () => {
    const error = await readStreamError([
      'data: {"type":"error","errorCode":"WORKSPACE_STORAGE_FULL","errorText":"Workspace storage is full."}\n\n',
      'data: {"type":"finish","finishReason":"error"}\n\n',
      "data: [DONE]\n\n",
    ]);

    expect(error).toBeInstanceOf(BunnyAgentStreamError);
    expect(error).toMatchObject({
      code: "WORKSPACE_STORAGE_FULL",
      message: "Workspace storage is full.",
    });
  });

  it("normalizes a storage-full error from an older daemon", async () => {
    const error = await readStreamError([
      'data: {"type":"error","errorText":"ENOSPC: no space left on device, write /agent/private"}\n\n',
      'data: {"type":"finish","finishReason":"error"}\n\n',
      "data: [DONE]\n\n",
    ]);

    expect(error).toMatchObject({
      code: "WORKSPACE_STORAGE_FULL",
      message: "Workspace storage is full.",
    });
    expect((error as Error).message).not.toContain("/agent/private");
  });
});

async function readStreamError(chunks: string[]): Promise<unknown> {
  const bunnyAgent = createBunnyAgent({
    sandbox: createStreamingSandbox(chunks),
    daemonUrl: "http://127.0.0.1:3080",
    runnerType: "pi",
  });
  const result = streamText({
    model: bunnyAgent("openai:gpt-5"),
    prompt: "test",
  });

  for await (const part of result.fullStream) {
    if (part.type === "error") return part.error;
  }

  throw new Error("Expected the stream to emit an error part.");
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
      for (const chunk of chunks) yield new TextEncoder().encode(chunk);
    },
  };

  return {
    attach: async () => handle,
    getHandle: () => handle,
    getWorkdir: () => "/workspace",
  };
}
