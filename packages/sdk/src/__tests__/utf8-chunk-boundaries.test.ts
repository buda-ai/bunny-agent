import type {
  BunnyAgentCodingRunBody,
  ExecOptions,
  SandboxAdapter,
  SandboxHandle,
} from "@bunny-agent/manager";
import { streamText } from "ai";
import { describe, expect, it } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";

const encoder = new TextEncoder();

/** Split the encoded stream at every given byte offset. */
function splitBytes(text: string, offsets: number[]): Uint8Array[] {
  const bytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];
  let start = 0;
  for (const offset of offsets) {
    chunks.push(bytes.slice(start, offset));
    start = offset;
  }
  chunks.push(bytes.slice(start));
  return chunks;
}

describe("Bunny provider UTF-8 decoding", () => {
  it("keeps multi-byte characters intact when a network chunk splits them", async () => {
    const reply = "你好，世界 🐰";
    const sse = `data: ${JSON.stringify({ type: "text", text: reply })}\n\ndata: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n`;
    const prefixBytes = encoder.encode('data: {"type":"text","text":"').length;
    // Cut inside 你 (3 bytes), inside 界, and inside the 4-byte emoji.
    const youOffset = prefixBytes + 1;
    const jieOffset = prefixBytes + encoder.encode("你好，世").length + 2;
    const emojiOffset = prefixBytes + encoder.encode("你好，世界 ").length + 3;

    const bunnyAgent = createBunnyAgent({
      sandbox: createByteStreamingSandbox(
        splitBytes(sse, [youOffset, jieOffset, emojiOffset]),
      ),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      prompt: "test",
    });

    await expect(result.text).resolves.toBe(reply);
  });

  it("decodes a character split across the final chunk without a trailing newline", async () => {
    const sse = `data: {"type":"text","text":"完成"}\n\ndata: {"type":"finish","finishReason":"stop"}`;
    const bytes = encoder.encode(sse);
    const cut = encoder.encode('data: {"type":"text","text":"完').length - 1;

    const bunnyAgent = createBunnyAgent({
      sandbox: createByteStreamingSandbox([
        bytes.slice(0, cut),
        bytes.slice(cut),
      ]),
      daemonUrl: "http://127.0.0.1:3080",
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      prompt: "test",
    });

    await expect(result.text).resolves.toBe("完成");
  });
});

function createByteStreamingSandbox(chunks: Uint8Array[]): SandboxAdapter {
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
        yield chunk;
      }
    },
  };

  return {
    attach: async () => handle,
    getHandle: () => handle,
    getWorkdir: () => "/workspace",
  };
}
