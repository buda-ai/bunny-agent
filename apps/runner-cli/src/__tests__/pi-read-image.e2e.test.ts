import { type ChildProcess, spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import type { SandboxAdapter, SandboxHandle } from "@bunny-agent/manager";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const repository = resolve(import.meta.dirname, "../../../..");
const cli = join(repository, "apps/runner-cli/dist/bundle.mjs");
const daemon = join(repository, "apps/daemon/dist/bundle.mjs");
const model = "image-e2e:fixture-vision";
function encodePng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number[],
): string {
  const chunk = (name: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    const trailer = Buffer.alloc(4);
    trailer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, body, trailer]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      pixels.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

const png = encodePng(1, 1, () => [255, 0, 0]);
const imageUrl = `data:image/png;base64,${png}`;
const secondImageUrl = `data:image/png;base64,${encodePng(1, 1, () => [0, 0, 255])}`;

function visualFixture(): {
  data: string;
  code: string;
  circle: string;
  square: string;
} {
  const code = String(randomInt(100000, 1000000));
  const digits = [
    "11111/10001/10001/10001/10001/10001/11111",
    "00100/01100/00100/00100/00100/00100/01110",
    "11111/00001/00001/11111/10000/10000/11111",
    "11111/00001/00001/11111/00001/00001/11111",
    "10001/10001/10001/11111/00001/00001/00001",
    "11111/10000/10000/11111/00001/00001/11111",
    "11111/10000/10000/11111/10001/10001/11111",
    "11111/00001/00010/00100/01000/01000/01000",
    "11111/10001/10001/11111/10001/10001/11111",
    "11111/10001/10001/11111/00001/00001/11111",
  ].map((digit) => digit.split("/"));
  const circle = randomInt(2) ? "red" : "blue";
  const square = circle === "red" ? "blue" : "red";
  const color = (name: string) =>
    name === "red" ? [235, 20, 20] : [20, 40, 235];
  const data = encodePng(420, 280, (x, y) => {
    const textX = Math.floor((x - 34) / 10);
    const textY = Math.floor((y - 25) / 10);
    const digit = Math.floor(textX / 6);
    if (
      textX >= 0 &&
      digit < code.length &&
      textY >= 0 &&
      textY < 7 &&
      digits[Number(code[digit])][textY][textX % 6] === "1"
    )
      return [0, 0, 0];
    if ((x - 110) ** 2 + (y - 195) ** 2 <= 55 ** 2) return color(circle);
    if (x >= 255 && x < 365 && y >= 140 && y < 250) return color(square);
    return [255, 255, 255];
  });
  return { data, code, circle, square };
}

interface WireMessage {
  role: string;
  content:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface WireRequest {
  messages: WireMessage[];
  tools?: Array<{ function: { name: string; parameters: unknown } }>;
}

function images(request: WireRequest): string[] {
  return request.messages.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.flatMap((part) =>
          part.image_url ? [part.image_url.url] : [],
        )
      : [],
  );
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  return `http://127.0.0.1:${address.port}`;
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((done) => {
    child.once("exit", () => done());
    child.kill("SIGTERM");
  });
}

function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((done, reject) => {
    const redact = (text: string) =>
      Object.entries(env).reduce(
        (output, [name, value]) =>
          /(?:API_KEY|TOKEN|SECRET)$/.test(name) && value
            ? output.split(value).join("[REDACTED]")
            : output,
        text,
      );
    const child = spawn(process.execPath, [cli, ...args], {
      env,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Pi CLI test timed out"));
    }, 30_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        reject(new Error(`Pi CLI exited ${code}: ${redact(stderr)}`));
      else done(redact(stdout));
    });
  });
}

describe("Pi native image HTTP E2E (built CLI, daemon and SDK)", () => {
  let workdir: string;
  let upstream: Server;
  let daemonProcess: ChildProcess;
  let daemonUrl: string;
  let env: NodeJS.ProcessEnv;
  const requests: WireRequest[] = [];
  const executions: Promise<void>[] = [];
  const executionErrors: unknown[] = [];

  function observeSandbox(sandbox: SandboxAdapter): SandboxAdapter {
    const attach = sandbox.attach.bind(sandbox);
    const observed = new WeakSet<SandboxHandle>();
    sandbox.attach = async () => {
      const handle = await attach();
      if (observed.has(handle)) return handle;
      observed.add(handle);
      const exec = handle.exec.bind(handle);
      handle.exec = async function* (command, options) {
        let complete!: () => void;
        executions.push(
          new Promise<void>((done) => {
            complete = done;
          }),
        );
        try {
          yield* exec(command, options);
        } catch (error) {
          executionErrors.push(error);
          throw error;
        } finally {
          complete();
        }
      };
      return handle;
    };
    return sandbox;
  }

  async function drainExecutions(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.all(executions),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Sandbox HTTP transport did not finish within 10 seconds",
                ),
              ),
            10_000,
          );
        }),
      ]);
      expect(executionErrors).toEqual([]);
    } finally {
      clearTimeout(timer);
    }
  }

  beforeAll(async () => {
    workdir = await mkdtemp(join(tmpdir(), "bunny-pi-images-"));
    await writeFile(join(workdir, "fixture.png"), Buffer.from(png, "base64"));
    upstream = createServer(async (req, res) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(
          Buffer.concat(chunks).toString(),
        ) as WireRequest;
        requests.push(body);
        const needsRead =
          JSON.stringify(body.messages).includes("READ_FILE_FIXTURE") &&
          !body.messages.some((message) => message.role === "tool");
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const delta = needsRead
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: "read-fixture",
                  type: "function",
                  function: {
                    name: "read_image",
                    arguments: JSON.stringify({ file_path: "fixture.png" }),
                  },
                },
              ],
            }
          : { content: "Image received." };
        res.write(
          `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-vision", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-vision", choices: [{ index: 0, delta: {}, finish_reason: needsRead ? "tool_calls" : "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}\n\n`,
        );
        res.end("data: [DONE]\n\n");
      } catch {
        res.writeHead(500);
        res.end("Invalid test model request");
      }
    });
    const upstreamUrl = await listen(upstream);
    // A fresh agent directory prevents loading user extensions or touching user sessions.
    env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PI_CODING_AGENT_DIR: join(workdir, "agent"),
      OPENAI_BASE_URL: `${upstreamUrl}/v1`,
      IMAGE_E2E_API_KEY: "local-test-key",
      BUNNY_AGENT_ROOT: workdir,
    };
    // The CLI logs the configured port, so discover an ephemeral port with a local reservation.
    const reservation = createServer();
    daemonUrl = await listen(reservation);
    await new Promise<void>((done) => reservation.close(() => done()));
    daemonProcess = spawn(process.execPath, [daemon], {
      env: {
        ...env,
        BUNNY_AGENT_DAEMON_HOST: "127.0.0.1",
        BUNNY_AGENT_DAEMON_PORT: new URL(daemonUrl).port,
      },
      stdio: "pipe",
    });
    let diagnostics = "";
    daemonProcess.stderr?.on("data", (chunk) => {
      diagnostics += chunk.toString();
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (daemonProcess.exitCode !== null)
        throw new Error(`Daemon exited: ${diagnostics}`);
      if (
        await fetch(`${daemonUrl}/healthz`)
          .then((response) => response.ok)
          .catch(() => false)
      )
        return;
      await new Promise((done) => setTimeout(done, 50));
    }
    throw new Error(`Daemon did not become ready: ${diagnostics}`);
  }, 15_000);

  afterEach(drainExecutions, 15_000);

  afterAll(async () => {
    try {
      await drainExecutions();
    } finally {
      if (daemonProcess) await stopProcess(daemonProcess);
      if (upstream)
        await new Promise<void>((done) => upstream.close(() => done()));
      if (workdir) await rm(workdir, { recursive: true, force: true });
    }
  }, 15_000);

  it("sends file image bytes after the real CLI executes read_image, and preserves them on resume", async () => {
    const start = requests.length;
    const output = await runCli(
      [
        "run",
        "--runner",
        "pi",
        "--model",
        model,
        "--cwd",
        workdir,
        "--allowed-tools",
        "read_image",
        "--yolo",
        "--",
        "READ_FILE_FIXTURE",
      ],
      env,
    );
    expect(output).not.toContain('"type":"error"');
    const calls = requests.slice(start);
    expect(calls).toHaveLength(2);
    expect(calls[0].tools?.map((tool) => tool.function.name)).toEqual([
      "read_image",
    ]);
    expect(images(calls[0])).toEqual([]);
    expect(images(calls[1])).toEqual([imageUrl]);
    const events = output
      .split("\n")
      .filter((line) => line.startsWith("data: {"))
      .map((line) => JSON.parse(line.slice(6)));
    const sessionId = events.find((event) => event.messageMetadata?.sessionId)
      ?.messageMetadata.sessionId;
    expect(sessionId).toEqual(expect.any(String));
    const resumeStart = requests.length;
    const resumed = await runCli(
      [
        "run",
        "--runner",
        "pi",
        "--model",
        model,
        "--cwd",
        workdir,
        "--resume",
        sessionId,
        "--allowed-tools",
        "read_image",
        "--yolo",
        "--",
        "Describe the previous image again.",
      ],
      env,
    );
    expect(resumed).not.toContain('"type":"error"');
    expect(images(requests[resumeStart])).toEqual([imageUrl]);
  }, 60_000);

  it("sends ordered SDK uploads through the real daemon and restores uploaded image history", async () => {
    const sdkPath = pathToFileURL(
      join(repository, "packages/sdk/dist/index.js"),
    ).href;
    const localPath = pathToFileURL(
      join(repository, "packages/sandbox-local/dist/index.js"),
    ).href;
    const { createBunnyAgent } = await import(sdkPath);
    const { LocalMachine } = await import(localPath);
    const provider = createBunnyAgent({
      sandbox: observeSandbox(new LocalMachine({ workdir })),
      daemonUrl,
      runnerType: "pi",
      env,
      allowedTools: [],
      logger: false,
    });
    const start = requests.length;
    const result = await provider(model).doGenerate({
      prompt: [
        {
          role: "user",
          content: [
            { type: "text", text: "first " },
            { type: "file", mediaType: "image/png", data: imageUrl },
            { type: "text", text: " then second " },
            { type: "file", mediaType: "image/png", data: secondImageUrl },
          ],
        },
      ],
    });
    expect(result.content).toContainEqual(
      expect.objectContaining({ type: "text", text: "Image received." }),
    );
    expect(images(requests[start])).toEqual([imageUrl, secondImageUrl]);
    const uploadText = JSON.stringify(requests[start].messages);
    expect(uploadText).toContain("first [Image #1] then second [Image #2]");
    const sessionId = result.providerMetadata?.["bunny-agent"]?.sessionId;
    expect(sessionId).toEqual(expect.any(String));
    const resumeStart = requests.length;
    await provider(model, { resume: sessionId }).doGenerate({
      prompt: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe the previous two images again." },
          ],
        },
      ],
    });
    expect(images(requests[resumeStart])).toEqual([imageUrl, secondImageUrl]);
  }, 60_000);

  it
    .skipIf(process.env.BUNNY_AGENT_LIVE_IMAGE_E2E !== "1")
    .each(["file", "upload"])(
    "recognizes random text and colored shapes with a live vision model through %s input",
    async (entryPoint) => {
      if (!process.env.OPENAI_API_KEY)
        throw new Error("Live image E2E requires OPENAI_API_KEY");
      const fixture = visualFixture();
      await writeFile(
        join(workdir, "live-fixture.png"),
        Buffer.from(fixture.data, "base64"),
      );
      const liveEnv = {
        ...env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_BASE_URL:
          process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      };
      const liveModel =
        process.env.BUNNY_AGENT_LIVE_IMAGE_MODEL ?? "openai:gpt-4o-mini";
      const question =
        "Return exactly one JSON object with code (the six digits at the top), circle (its color), and square (its color).";
      const assertAnswer = (text: string) => {
        const object = text.match(/\{[^{}]+\}/)?.[0];
        expect(object, "Vision model must return a JSON answer").toBeDefined();
        const answer = JSON.parse(object!);
        expect(String(answer.code)).toBe(fixture.code);
        expect(String(answer.circle).toLowerCase()).toBe(fixture.circle);
        expect(String(answer.square).toLowerCase()).toBe(fixture.square);
      };
      if (entryPoint === "file") {
        const output = await runCli(
          [
            "run",
            "--runner",
            "pi",
            "--model",
            liveModel,
            "--cwd",
            workdir,
            "--allowed-tools",
            "read_image",
            "--max-turns",
            "3",
            "--yolo",
            "--",
            `Use read_image to inspect live-fixture.png. ${question}`,
          ],
          liveEnv,
        );
        const events = output
          .split("\n")
          .filter((line) => line.startsWith("data: {"))
          .map((line) => JSON.parse(line.slice(6)));
        expect(
          events
            .filter((event) => event.type === "error")
            .map((event) => event.errorText),
        ).toEqual([]);
        expect(
          events.some(
            (event) =>
              event.toolName === "read_image" || event.toolName === "ReadImage",
          ),
        ).toBe(true);
        assertAnswer(
          events
            .filter((event) => event.type === "text-delta")
            .map((event) => event.delta)
            .join(""),
        );
        return;
      }
      const { createBunnyAgent } = await import(
        pathToFileURL(join(repository, "packages/sdk/dist/index.js")).href
      );
      const { LocalMachine } = await import(
        pathToFileURL(join(repository, "packages/sandbox-local/dist/index.js"))
          .href
      );
      const provider = createBunnyAgent({
        sandbox: observeSandbox(new LocalMachine({ workdir })),
        daemonUrl,
        runnerType: "pi",
        env: liveEnv,
        allowedTools: [],
        maxTurns: 1,
        logger: false,
      });
      const result = await provider(liveModel).doGenerate({
        abortSignal: AbortSignal.timeout(45_000),
        prompt: [
          {
            role: "user",
            content: [
              { type: "text", text: question },
              {
                type: "file",
                mediaType: "image/png",
                data: `data:image/png;base64,${fixture.data}`,
              },
            ],
          },
        ],
      });
      assertAnswer(
        result.content
          .filter((part: { type: string }) => part.type === "text")
          .map((part: { text: string }) => part.text)
          .join(""),
      );
    },
    90_000,
  );
});
