import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalMachine } from "@bunny-agent/sandbox-local";
import { streamText } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { createBunnyAgent } from "../provider/bunny-agent-provider";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

/** A daemon whose coding run takes longer than the sandbox's default command timeout. */
async function slowDaemon(parts: string[], gapMs: number): Promise<string> {
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", async () => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      for (const text of parts) {
        await new Promise((resolve) => setTimeout(resolve, gapMs));
        response.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
      }
      response.end(
        'data: {"type":"finish","finishReason":"stop"}\n\ndata: [DONE]\n\n',
      );
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address == null || typeof address === "string")
    throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

describe("daemon coding runs on exec-based sandboxes", () => {
  it("are not cut off by the sandbox's default command timeout", async () => {
    const daemonUrl = await slowDaemon(["a", "b", "c", "d", "e"], 200);
    const workdir = await mkdtemp(join(tmpdir(), "bunny-daemon-timeout-"));
    const bunnyAgent = createBunnyAgent({
      // A 300ms default stands in for LocalMachine's 5-minute default: the run
      // takes ~1s, so any wall-clock limit on the daemon call would kill it.
      sandbox: new LocalMachine({ workdir, defaultTimeout: 300 }),
      daemonUrl,
    });

    const result = streamText({
      model: bunnyAgent("google:gemini-2.5-pro", { runnerType: "pi" }),
      prompt: "long task",
    });

    await expect(result.text).resolves.toBe("abcde");
  }, 20_000);
});
