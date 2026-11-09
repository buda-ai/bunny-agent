import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  isContextOverflow,
} from "@earendil-works/pi-ai";
import {
  type AgentSessionEvent,
  createAgentSession,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";

const CAPACITY_ERROR =
  "Model context limit reached. Conversation size exceeds model capacity.";

type Mode = "success" | "repeat" | "summary-failure" | "tool" | "healthy";

async function runHttpCase(
  mode: Mode | { status: number; message: string },
  compactionEnabled = true,
) {
  const root = mkdtempSync(join(tmpdir(), "bunny-kiro-recovery-"));
  const marker = "TASK_KEEP_BLUE_MOBILE_ONLY";
  let calls = 0;
  let normalCalls = 0;
  let summaryCalls = 0;
  let toolCalls = 0;
  const events: AgentSessionEvent[] = [];
  const server = createServer(async (req, res) => {
    calls++;
    let body = "";
    for await (const chunk of req) body += chunk;
    const summarizing = body.includes("context summarization assistant");
    if (summarizing) summaryCalls++;
    else normalCalls++;
    const fail = (status: number, message: string) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { type: "upstream_error", message } }));
    };
    const answer = (text: string, tool = false) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const delta = tool
        ? {
            tool_calls: [
              {
                index: 0,
                id: "call-record",
                type: "function",
                function: { name: "record", arguments: "{}" },
              },
            ],
          }
        : { content: text };
      for (const choice of [
        { index: 0, delta, finish_reason: null },
        { index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" },
      ]) {
        res.write(
          `data: ${JSON.stringify({ id: "test", model: "kiro-test", object: "chat.completion.chunk", choices: [choice], usage: { prompt_tokens: 1000, completion_tokens: 20, total_tokens: 1020 } })}\n\n`,
        );
      }
      res.end("data: [DONE]\n\n");
    };
    if (summarizing) {
      if (mode === "summary-failure") fail(400, CAPACITY_ERROR);
      else
        answer(`## Goal\n${marker}\nKeep the blue theme; change mobile only.`);
      return;
    }
    if (typeof mode === "object") {
      fail(mode.status, mode.message);
      return;
    }
    if (mode === "tool" && normalCalls === 1) {
      answer("", true);
      return;
    }
    if (
      (mode !== "healthy" && normalCalls === (mode === "tool" ? 2 : 1)) ||
      mode === "repeat"
    ) {
      fail(400, CAPACITY_ERROR);
      return;
    }
    answer(body.includes(marker) ? `Remembered ${marker}.` : "Task missing.");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  let session:
    | Awaited<ReturnType<typeof createAgentSession>>["session"]
    | undefined;
  try {
    const runtime = await ModelRuntime.create({
      modelsPath: null,
      modelsStorePath: join(root, "models.json"),
      authPath: join(root, "auth.json"),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    runtime.registerProvider("kiro-test", {
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      apiKey: "test-key",
      api: "openai-completions",
      models: [
        {
          id: "kiro-test",
          name: "Test",
          reasoning: false,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200_000,
          maxTokens: 8192,
        },
      ],
    });
    const model = runtime.getModel("kiro-test", "kiro-test")!;
    const manager = SessionManager.create(root, join(root, "sessions"));
    const sessionId = manager.getSessionId();
    const usage = {
      input: 50_000,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 50_001,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    manager.appendMessage({
      role: "user",
      content: [
        { type: "text", text: `Remember ${marker}. Keep blue; mobile only.` },
        {
          type: "image",
          data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1kAAAAASUVORK5CYII=",
          mimeType: "image/png",
        },
      ],
      timestamp: Date.now(),
    });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "Acknowledged." }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage,
      stopReason: "stop",
      timestamp: Date.now(),
    });
    manager.appendMessage({
      role: "user",
      content: [
        { type: "text", text: "Inert padding: " + "padding ".repeat(11_000) },
      ],
      timestamp: Date.now(),
    });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "Acknowledged padding." }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage,
      stopReason: "stop",
      timestamp: Date.now(),
    });
    ({ session } = await createAgentSession({
      cwd: root,
      agentDir: join(root, "agent"),
      model,
      modelRuntime: runtime,
      sessionManager: manager,
      settingsManager: SettingsManager.inMemory({
        compaction: {
          enabled: compactionEnabled,
          reserveTokens: 16384,
          keepRecentTokens: 20000,
        },
        retry: { enabled: false },
      }),
      noTools: "builtin",
      customTools:
        mode === "tool"
          ? [
              defineTool({
                name: "record",
                label: "Record",
                description: "Record an isolated side effect",
                parameters: Type.Object({}),
                execute: async () => {
                  toolCalls++;
                  return {
                    content: [{ type: "text", text: "Recorded." }],
                    details: undefined,
                  };
                },
              }),
            ]
          : [],
    }));
    session.subscribe((event) => events.push(event));
    await session.prompt("Return the original task requirements.");
    const compactions = manager
      .getEntries()
      .filter((entry) => entry.type === "compaction");
    const last = session.messages
      .filter((message) => message.role === "assistant")
      .at(-1);
    const answer =
      last?.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("") ?? "";
    const reloaded = SessionManager.open(manager.getSessionFile()!);
    return {
      calls,
      normalCalls,
      summaryCalls,
      toolCalls,
      events,
      compactions,
      answer,
      marker,
      sessionId,
      reloadedId: reloaded.getSessionId(),
      reloadedEntries: reloaded.getEntries(),
    };
  } finally {
    session?.dispose();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(root, { recursive: true, force: true });
  }
}

describe("Kiro context-capacity recovery through Pi HTTP", () => {
  it("recognizes the original gateway message without rewriting it", () => {
    const message = {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage: `400: {"message":"${CAPACITY_ERROR}","type":"upstream_error"}`,
    } as unknown as AssistantMessage;
    expect(isContextOverflow(message)).toBe(true);
    expect(message.errorMessage).toContain(CAPACITY_ERROR);
    expect(
      isContextOverflow({
        ...message,
        errorMessage: "Model context limit reached; image decoding failed.",
      }),
    ).toBe(false);
  });

  it("compacts once, retries, and persists the summary in the same session", async () => {
    const result = await runHttpCase("success");
    expect([
      result.normalCalls,
      result.summaryCalls,
      result.compactions.length,
    ]).toEqual([2, 1, 1]);
    expect(result.answer).toContain(result.marker);
    expect(result.compactions[0].summary).toContain(result.marker);
    expect(result.reloadedId).toBe(result.sessionId);
    expect(
      result.reloadedEntries.some((entry) => entry.type === "compaction"),
    ).toBe(true);
  });

  it("stops after one compact-and-retry cycle if capacity is still exceeded", async () => {
    const result = await runHttpCase("repeat");
    expect([result.normalCalls, result.summaryCalls]).toEqual([2, 1]);
    expect(
      result.events.some(
        (event) =>
          event.type === "compaction_end" &&
          event.willRetry === false &&
          event.errorMessage?.includes("after one compact-and-retry"),
      ),
    ).toBe(true);
  });

  it("reports summary failure without replacing the session history", async () => {
    const result = await runHttpCase("summary-failure");
    expect([result.calls, result.compactions.length]).toEqual([2, 0]);
    expect(
      result.events.some(
        (event) =>
          event.type === "compaction_end" &&
          !!event.errorMessage &&
          !event.willRetry,
      ),
    ).toBe(true);
    expect(
      result.reloadedEntries.some(
        (entry) => entry.type === "message" && entry.message.role === "user",
      ),
    ).toBe(true);
  });

  it.each([
    {
      status: 400,
      message: "Image exceeds size limit. (reason: IMAGE_SIZE_EXCEEDED)",
    },
    {
      status: 400,
      message: "Kiro API rejected the request as improperly formed.",
    },
    { status: 401, message: "Invalid API key." },
    { status: 429, message: "Rate limit exceeded." },
  ])("does not compact for unrelated $status: $message", async (error) => {
    const result = await runHttpCase(error);
    expect([
      result.calls,
      result.summaryCalls,
      result.compactions.length,
    ]).toEqual([1, 0, 0]);
  });

  it("leaves healthy requests on their normal path", async () => {
    const result = await runHttpCase("healthy");
    expect([
      result.calls,
      result.summaryCalls,
      result.compactions.length,
    ]).toEqual([1, 0, 0]);
    expect(result.answer).toContain(result.marker);
  });

  it("respects explicitly disabled compaction", async () => {
    const result = await runHttpCase("success", false);
    expect([
      result.calls,
      result.summaryCalls,
      result.compactions.length,
    ]).toEqual([1, 0, 0]);
  });

  it("does not re-execute a completed tool during overflow recovery", async () => {
    const result = await runHttpCase("tool");
    expect(result.toolCalls).toBe(1);
    expect([result.normalCalls, result.summaryCalls]).toEqual([3, 1]);
    expect(result.answer).toContain(result.marker);
  });
});
