import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvalFileName } from "@bunny-agent/manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPiRunner, type PiRunnerOptions } from "../pi-runner.js";
import { ENV_DUMP_BLOCKED_MESSAGE } from "../tool-overrides.js";
import {
  type FakeChatReply,
  type FakeOpenAiServer,
  startFakeOpenAiServer,
  toolResultText,
} from "./fake-openai-server.js";

// Drives the real runner — pi session, built-in tools, tool hooks, approval
// files — against a scripted OpenAI-compatible endpoint.

const SECRET = "sk-test-secret-0123456789";

let cwd: string;
let agentDir: string;
let server: FakeOpenAiServer | undefined;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "pi-hooks-cwd-"));
  agentDir = mkdtempSync(join(tmpdir(), "pi-hooks-agent-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await server?.close();
  server = undefined;
  rmSync(cwd, { recursive: true, force: true });
  rmSync(agentDir, { recursive: true, force: true });
});

async function startServer(
  replies: FakeChatReply[],
  options?: { toolBody?: string },
): Promise<FakeOpenAiServer> {
  server = await startFakeOpenAiServer(
    (_request, index) => replies[index] ?? { text: "done" },
    options,
  );
  return server;
}

async function drain(stream: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of stream) out += chunk;
  return out;
}

function runPi(
  fake: FakeOpenAiServer,
  options: Partial<PiRunnerOptions> = {},
): Promise<string> {
  const runner = createPiRunner({
    model: "fakeprov:fake-model",
    cwd,
    env: { FAKEPROV_API_KEY: SECRET, FAKEPROV_BASE_URL: fake.baseUrl },
    ...options,
  });
  return drain(runner.run("go"));
}

function approvalPath(toolCallId: string): string {
  return join(cwd, ".bunny-agent", "approvals", approvalFileName(toolCallId));
}

/** Wait for the runner's pending approval file, approve it, return what it asked. */
async function approveWhenAsked(
  toolCallId: string,
): Promise<Record<string, unknown>> {
  const file = approvalPath(toolCallId);
  for (let i = 0; i < 400; i++) {
    if (existsSync(file)) {
      const pending = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...pending, status: "completed" }));
      return pending;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`no approval request for ${toolCallId}`);
}

describe("createPiRunner tool hooks (real pi session)", () => {
  it("asks for approval before a built-in tool runs and redacts its result", async () => {
    writeFileSync(join(cwd, "notes.txt"), `the key is ${SECRET}\n`);
    const fake = await startServer([
      { toolCall: { name: "read", arguments: { path: "notes.txt" } } },
    ]);

    const [output, pending] = await Promise.all([
      runPi(fake),
      approveWhenAsked("call_1"),
    ]);

    expect(pending).toMatchObject({
      status: "pending",
      toolName: "read",
      input: { path: "notes.txt" },
    });
    const seen = toolResultText(fake.requests[1], "call_1");
    expect(seen).toContain("the key is ***");
    expect(seen).not.toContain(SECRET);
    expect(output).toContain("done");
    expect(output).not.toContain(SECRET);
  });

  it("redacts secrets from tool ref results, not just bash and read", async () => {
    const fake = await startServer(
      [{ toolCall: { name: "lookup", arguments: {} } }],
      { toolBody: `token ${SECRET} issued` },
    );

    await runPi(fake, {
      yolo: true,
      toolRefs: [
        {
          name: "lookup",
          description: "Look something up",
          inputSchema: { type: "object", properties: {} },
          runtime: { type: "http", url: `${fake.baseUrl}/tool` },
        },
      ],
    });

    const seen = toolResultText(fake.requests[1], "call_1");
    expect(seen).toContain("token *** issued");
    expect(seen).not.toContain(SECRET);
  });

  it("blocks env dumps without asking for approval", async () => {
    const fake = await startServer([
      { toolCall: { name: "bash", arguments: { command: "env | sort" } } },
    ]);

    await runPi(fake);

    expect(toolResultText(fake.requests[1], "call_1")).toContain(
      ENV_DUMP_BLOCKED_MESSAGE,
    );
    expect(existsSync(join(cwd, ".bunny-agent", "approvals"))).toBe(false);
  });

  it("still runs commands that only set env for a program", async () => {
    const fake = await startServer([
      {
        toolCall: {
          name: "bash",
          arguments: {
            command: "env GREETING=hi-from-env sh -c 'echo $GREETING'",
          },
        },
      },
    ]);

    await runPi(fake, { yolo: true });

    expect(toolResultText(fake.requests[1], "call_1")).toContain("hi-from-env");
  });

  it("runs tools without approval files in yolo mode", async () => {
    const fake = await startServer([
      {
        toolCall: { name: "bash", arguments: { command: "echo hi-from-bash" } },
      },
    ]);

    await runPi(fake, { yolo: true });

    expect(toolResultText(fake.requests[1], "call_1")).toContain(
      "hi-from-bash",
    );
    expect(existsSync(join(cwd, ".bunny-agent", "approvals"))).toBe(false);
  });

  it("opens the model's system prompt with the caller's prompt", async () => {
    const fake = await startServer([{ text: "done" }]);

    await runPi(fake, { yolo: true, systemPrompt: "You are Bunny QA." });

    const system = fake.requests[0].messages[0];
    expect(system.role).toBe("system");
    const text = JSON.stringify(system.content);
    expect(text.startsWith('"You are Bunny QA.')).toBe(true);
    expect(text).not.toContain("operating inside pi");
  });

  it("stores sessions under pi's agent dir and resumes them by id", async () => {
    const fake = await startServer([{ text: "first" }, { text: "second" }]);

    const first = await runPi(fake, { yolo: true });
    const sessionId = /"sessionId":"([^"]+)"/.exec(first)?.[1];
    expect(sessionId).toBeTruthy();
    const sessionsDir = join(agentDir, "sessions");
    const files = readdirSync(sessionsDir, { recursive: true }).map(String);
    expect(files.some((f) => f.endsWith(`_${sessionId}.jsonl`))).toBe(true);

    await runPi(fake, { yolo: true, sessionId });

    const resumed = JSON.stringify(fake.requests[1].messages);
    expect(resumed).toContain("first");
  });
});
