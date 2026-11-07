import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import { createPiRunner } from "../pi-runner.js";
import { MAX_SESSION_FILE_BYTES } from "../session-utils.js";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

it("migrates an oversized legacy session and sends the same images, goal and latest instruction over real provider HTTP on two restarts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pi-media-http-"));
  const agentDir = join(directory, "agent");
  mkdirSync(agentDir);
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({
      compaction: { enabled: false },
      retry: { enabled: false },
    }),
  );
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(
      `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "Context received" }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No HTTP port");
    const manager = SessionManager.create(
      directory,
      join(directory, "sessions"),
    );
    const goal = manager.appendMessage({
      role: "user",
      content: "Make a video with Chinese captions",
      timestamp: 1,
    });
    manager.appendCompaction(
      "Goal: make a video with Chinese captions",
      goal,
      100,
    );
    // Deliberately larger than both the old 1 MiB tail and the 10 MiB reset threshold.
    // Synthetic bytes verify transport fidelity; this fixture does not test provider vision.
    const image = Buffer.alloc(8 * 1024 * 1024, 65).toString("base64");
    const smallImage = Buffer.from("second image fixture").toString("base64");
    manager.appendMessage({
      role: "user",
      timestamp: 2,
      content: [
        { type: "text", text: "Use the second image; retain Chinese captions" },
        { type: "image", mimeType: "image/png", data: image },
        { type: "image", mimeType: "image/png", data: smallImage },
      ],
    });
    const sessionPath = manager.getSessionFile()!;
    const sessionId = manager.getSessionId();
    expect(statSync(sessionPath).size).toBeGreaterThan(MAX_SESSION_FILE_BYTES);
    for (const text of [
      "Continue that video",
      "What was my last instruction?",
    ]) {
      const runner = createPiRunner({
        model: "media-fixture:fixture",
        cwd: directory,
        sessionId: sessionPath,
        allowedTools: [],
        env: {
          MEDIA_FIXTURE_API_KEY: "fixture-key",
          MEDIA_FIXTURE_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
          DEBUG: "true",
        },
      });
      const events: string[] = [];
      for await (const event of runner.run(text)) events.push(event);
      expect(events.join("")).toContain("Context received");
      expect(events.join("")).toContain(sessionId);
      const jsonl = readFileSync(sessionPath, "utf8");
      expect(Buffer.byteLength(jsonl)).toBeLessThan(12000);
      expect(jsonl).not.toContain(image.slice(0, 200));
      expect(JSON.parse(jsonl.split("\n")[0]).id).toBe(sessionId);
      expect(
        readFileSync(join(directory, "pi-message-stream-debug.json"), "utf8"),
      ).not.toContain(image.slice(0, 200));
    }
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      const serialized = JSON.stringify(request);
      expect(serialized).toContain("Chinese captions");
      expect(serialized).toContain("Use the second image");
      expect(serialized).not.toContain("bunnyMedia");
      const messages = request.messages as Array<{ content: unknown }>;
      const urls = messages.flatMap((message) =>
        Array.isArray(message.content)
          ? message.content
              .filter((part) => part.type === "image_url")
              .map((part) => part.image_url.url as string)
          : [],
      );
      expect(urls.map(hash)).toEqual(
        [image, smallImage].map((data) =>
          hash(`data:image/png;base64,${data}`),
        ),
      );
    }
    expect(JSON.stringify(requests[1])).toContain("Continue that video");
    expect(JSON.stringify(requests[1])).toContain(
      "What was my last instruction?",
    );
    expect(readdirSync(join(directory, "sessions", ".media"))).toHaveLength(2);
    expect(
      readdirSync(join(directory, "sessions")).filter((file) =>
        file.endsWith(".bak"),
      ),
    ).toHaveLength(1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
}, 30000);
