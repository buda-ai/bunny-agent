import {
  client,
  methods,
  PROTOCOL_VERSION,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRunnerCalls: Array<Record<string, unknown>> = [];
/** userInput of every runner whose abort signal fired. */
const abortedRunners: string[] = [];

vi.mock("@bunny-agent/runner-harness", async () => {
  const actual = await vi.importActual<
    typeof import("@bunny-agent/runner-harness")
  >("@bunny-agent/runner-harness");
  return {
    ...actual,
    createRunner: vi.fn((opts: Record<string, unknown>) => {
      createRunnerCalls.push(opts);
      // Mirror dispatchRunner's contract: an unrecognised runner throws
      // synchronously (runner-harness/src/runner.ts), rather than failing
      // somewhere inside the stream.
      const KNOWN_RUNNERS = [
        "claude",
        "codex",
        "gemini",
        "opencode",
        "copilot",
        "pi",
      ];
      if (!KNOWN_RUNNERS.includes(opts.runner as string)) {
        throw new Error(`Unknown runner: ${opts.runner}`);
      }
      const userInput =
        (opts.userInput as string | undefined) ?? "__STRUCTURED__";
      const abort = opts.abortController as AbortController | undefined;
      abort?.signal.addEventListener("abort", () => {
        abortedRunners.push(userInput);
      });
      return (async function* () {
        if (userInput === "__THROW__") {
          yield `data: ${JSON.stringify({ type: "error", errorText: "runner exploded" })}\n\n`;
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n`;
          yield `data: [DONE]\n\n`;
          return;
        }
        if (userInput === "__TOOL__") {
          yield `data: ${JSON.stringify({ type: "tool-input-start", toolCallId: "t1", toolName: "read_file" })}\n\n`;
          yield `data: ${JSON.stringify({ type: "tool-input-available", toolCallId: "t1", toolName: "read_file", input: { path: "a.ts" } })}\n\n`;
          yield `data: ${JSON.stringify({ type: "tool-output-available", toolCallId: "t1", output: "file body" })}\n\n`;
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
          yield `data: [DONE]\n\n`;
          return;
        }
        if (userInput === "__HANG__") {
          // Runs until the turn is cancelled through the abort controller.
          await new Promise<void>((resolve) => {
            if (abort?.signal.aborted) return resolve();
            abort?.signal.addEventListener("abort", () => resolve());
          });
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "abort" })}\n\n`;
          yield `data: [DONE]\n\n`;
          return;
        }
        if (userInput === "__META__") {
          yield `data: ${JSON.stringify({ type: "message-metadata", messageMetadata: { sessionId: "runner-session-1" } })}\n\n`;
          yield `data: ${JSON.stringify({ type: "step-finish", usage: { inputTokens: 12, outputTokens: 5 } })}\n\n`;
          yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
          yield `data: [DONE]\n\n`;
          return;
        }
        yield `data: ${JSON.stringify({ type: "text-start", id: "m1" })}\n\n`;
        yield `data: ${JSON.stringify({ type: "text-delta", id: "m1", delta: `echo: ${userInput}` })}\n\n`;
        yield `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`;
        yield `data: [DONE]\n\n`;
      })();
    }),
  };
});

import { createBunnyAgentAcpApp } from "../acp-agent.js";

describe("BunnyAgent ACP agent", () => {
  beforeEach(() => {
    createRunnerCalls.length = 0;
    abortedRunners.length = 0;
  });

  it("negotiates the protocol version on initialize", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);
    try {
      const result = await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(result.agentInfo?.name).toBe("bunny-agent");
    } finally {
      connection.close();
    }
  });

  it("streams session updates and resolves the prompt turn", async () => {
    const agentApp = createBunnyAgentAcpApp({ defaultCwd: "/workspace" });
    const clientApp = client({ name: "test-client" });
    const updates: SessionUpdate[] = [];
    clientApp.onNotification(methods.client.session.update, ({ params }) => {
      updates.push(params.update);
    });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        { cwd: "/workspace", mcpServers: [] },
      );
      const result = await connection.agent.request(
        methods.agent.session.prompt,
        {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "hi there" }],
        },
      );

      expect(result.stopReason).toBe("end_turn");
      expect(updates).toEqual([
        {
          sessionUpdate: "agent_message_chunk",
          messageId: "m1",
          content: { type: "text", text: "echo: hi there" },
        },
      ]);
      expect(createRunnerCalls[0]).toMatchObject({
        runner: "claude",
        userInput: "hi there",
        cwd: "/workspace",
        autoInject: false,
      });
    } finally {
      connection.close();
    }
  });

  it("selects runner and model from the bunny-agent _meta namespace", async () => {
    const agentApp = createBunnyAgentAcpApp({ defaultRunner: "claude" });
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        {
          cwd: "/workspace",
          mcpServers: [],
          _meta: { "bunny-agent": { runner: "pi", model: "gemini-3-pro" } },
        },
      );
      await connection.agent.request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "task" }],
      });

      expect(createRunnerCalls[0]).toMatchObject({
        runner: "pi",
        model: "gemini-3-pro",
      });
    } finally {
      connection.close();
    }
  });

  it("falls back to defaults when _meta is absent or malformed", async () => {
    const agentApp = createBunnyAgentAcpApp({
      defaultRunner: "codex",
      defaultModel: "gpt-5",
    });
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        {
          cwd: "/workspace",
          mcpServers: [],
          _meta: { "bunny-agent": { runner: 42, model: null } },
        },
      );
      await connection.agent.request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "task" }],
      });

      expect(createRunnerCalls[0]).toMatchObject({
        runner: "codex",
        model: "gpt-5",
      });
    } finally {
      connection.close();
    }
  });

  it("reports runner failures as a refusal stop reason", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        { cwd: "/workspace", mcpServers: [] },
      );
      const result = await connection.agent.request(
        methods.agent.session.prompt,
        {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "__THROW__" }],
        },
      );

      expect(result.stopReason).toBe("refusal");
    } finally {
      connection.close();
    }
  });

  it("streams a full tool call lifecycle to the client", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const updates: SessionUpdate[] = [];
    clientApp.onNotification(methods.client.session.update, ({ params }) => {
      updates.push(params.update);
    });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        { cwd: "/workspace", mcpServers: [] },
      );
      const result = await connection.agent.request(
        methods.agent.session.prompt,
        {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "__TOOL__" }],
        },
      );

      expect(result.stopReason).toBe("end_turn");
      expect(updates).toEqual([
        {
          sessionUpdate: "tool_call",
          toolCallId: "t1",
          title: "read_file",
          status: "pending",
        },
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "t1",
          status: "in_progress",
          rawInput: { path: "a.ts" },
        },
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "t1",
          status: "completed",
          rawOutput: "file body",
          content: [
            { type: "content", content: { type: "text", text: "file body" } },
          ],
        },
      ]);
    } finally {
      connection.close();
    }
  });

  it("cancels an in-flight turn via session/cancel", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        { cwd: "/workspace", mcpServers: [] },
      );

      const pending = connection.agent.request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "__HANG__" }],
      });

      // Let the prompt reach the runner before cancelling it.
      await new Promise((resolve) => setTimeout(resolve, 20));
      await connection.agent.notify(methods.agent.session.cancel, {
        sessionId: session.sessionId,
      });

      const result = await pending;
      expect(result.stopReason).toBe("cancelled");
    } finally {
      connection.close();
    }
  });

  it("aborts the runner when the client disconnects mid-prompt", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    await connection.agent.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });
    const session = await connection.agent.request(methods.agent.session.new, {
      cwd: "/workspace",
      mcpServers: [],
    });

    connection.agent
      .request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "__HANG__" }],
      })
      .catch(() => undefined);

    // Let the turn reach the runner, then drop the connection without any
    // session/cancel — an editor being closed, or a network drop.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(createRunnerCalls).toHaveLength(1);
    connection.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Without this the runner would keep running on a long-lived daemon.
    expect(abortedRunners).toContain("__HANG__");
  });

  it("keeps runner selection isolated between concurrent sessions", async () => {
    const agentApp = createBunnyAgentAcpApp({ defaultRunner: "claude" });
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const piSession = await connection.agent.request(
        methods.agent.session.new,
        {
          cwd: "/pi-dir",
          mcpServers: [],
          _meta: { "bunny-agent": { runner: "pi" } },
        },
      );
      const defaultSession = await connection.agent.request(
        methods.agent.session.new,
        { cwd: "/default-dir", mcpServers: [] },
      );

      await connection.agent.request(methods.agent.session.prompt, {
        sessionId: piSession.sessionId,
        prompt: [{ type: "text", text: "one" }],
      });
      await connection.agent.request(methods.agent.session.prompt, {
        sessionId: defaultSession.sessionId,
        prompt: [{ type: "text", text: "two" }],
      });

      expect(piSession.sessionId).not.toBe(defaultSession.sessionId);
      expect(createRunnerCalls[0]).toMatchObject({
        runner: "pi",
        cwd: "/pi-dir",
      });
      expect(createRunnerCalls[1]).toMatchObject({
        runner: "claude",
        cwd: "/default-dir",
      });
    } finally {
      connection.close();
    }
  });

  it("supports multiple prompt turns on one session", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        { cwd: "/workspace", mcpServers: [] },
      );

      for (const text of ["first", "second"]) {
        const result = await connection.agent.request(
          methods.agent.session.prompt,
          { sessionId: session.sessionId, prompt: [{ type: "text", text }] },
        );
        expect(result.stopReason).toBe("end_turn");
      }

      expect(createRunnerCalls.map((call) => call.userInput)).toEqual([
        "first",
        "second",
      ]);
    } finally {
      connection.close();
    }
  });

  it("joins multi-block prompts into the runner input", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        { cwd: "/workspace", mcpServers: [] },
      );
      await connection.agent.request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [
          { type: "text", text: "line one" },
          { type: "text", text: "line two" },
        ],
      });

      expect(createRunnerCalls[0].userInput).toBe("line one\nline two");
    } finally {
      connection.close();
    }
  });

  it("passes Buda runtime overrides from ACP metadata to createRunner", async () => {
    const agentApp = createBunnyAgentAcpApp({
      env: { OPENAI_API_KEY: "server-key", SHARED: "server" },
    });
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        {
          cwd: "/agent",
          mcpServers: [],
          _meta: {
            "bunny-agent": {
              runner: "pi",
              model: "openai:gpt-5",
              resume: "runner-session-0",
              skillPaths: ["/agent/skills"],
              env: { SHARED: "session", AGENT_KEY: "agent-key" },
              allowedTools: ["bash", "read_file"],
            },
          },
        },
      );

      await connection.agent.request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "ignored by structured input" }],
        _meta: {
          "bunny-agent": {
            input: {
              version: 1,
              input: [{ type: "text", text: "structured" }],
              capabilities: [],
              execution: {},
            },
            env: { SHARED: "turn" },
            systemEnv: { AGENT_KEY: "agent-key" },
            effort: "high",
            mcpConfig: { mcpServers: {} },
            toolRefs: [
              {
                name: "buda_tool",
                description: "Buda tool",
                inputSchema: { type: "object" },
                runtime: { type: "http", url: "https://buda.test/tool" },
              },
            ],
          },
        },
      });

      expect(createRunnerCalls[0]).toMatchObject({
        runner: "pi",
        model: "openai:gpt-5",
        input: { version: 1 },
        resume: "runner-session-0",
        skillPaths: ["/agent/skills"],
        allowedTools: ["bash", "read_file"],
        env: {
          OPENAI_API_KEY: "server-key",
          SHARED: "turn",
          AGENT_KEY: "agent-key",
        },
        systemEnv: { AGENT_KEY: "agent-key" },
        effort: "high",
        mcpConfig: { mcpServers: {} },
        toolRefs: [expect.objectContaining({ name: "buda_tool" })],
      });
      expect(createRunnerCalls[0]).not.toHaveProperty("userInput");
    } finally {
      connection.close();
    }
  });

  it("returns runner session metadata and ACP token usage", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        {
          cwd: "/workspace",
          mcpServers: [],
        },
      );
      const result = await connection.agent.request(
        methods.agent.session.prompt,
        {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "__META__" }],
        },
      );

      expect(result.usage).toEqual({
        inputTokens: 12,
        outputTokens: 5,
        totalTokens: 17,
      });
      expect(result._meta).toEqual({
        "bunny-agent": { sessionId: "runner-session-1" },
      });
    } finally {
      connection.close();
    }
  });

  it("rejects prompts for unknown sessions", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      await expect(
        connection.agent.request(methods.agent.session.prompt, {
          sessionId: "does-not-exist",
          prompt: [{ type: "text", text: "hi" }],
        }),
      ).rejects.toThrow(/Unknown session/);
    } finally {
      connection.close();
    }
  });

  it("surfaces an unknown runner from _meta as invalidParams, not a bare internal error", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        {
          cwd: "/workspace",
          mcpServers: [],
          // A plausible client-side typo — must not read as "Internal error".
          _meta: { "bunny-agent": { runner: "claude-code" } },
        },
      );

      const error = await connection.agent
        .request(methods.agent.session.prompt, {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "hi" }],
        })
        .then(
          () => undefined,
          (e) => e as { code?: number; message?: string; data?: unknown },
        );

      expect(error).toBeDefined();
      // -32602 invalid params, not -32603 internal error.
      expect(error?.code).toBe(-32602);
      // The real reason must reach the client, not just "Invalid params".
      expect(error?.message).toMatch(/Unknown runner: claude-code/);
    } finally {
      connection.close();
    }
  });

  it("clears the abort handle when runner setup fails", async () => {
    const agentApp = createBunnyAgentAcpApp();
    const clientApp = client({ name: "test-client" });
    const connection = clientApp.connect(agentApp as never);

    try {
      await connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await connection.agent.request(
        methods.agent.session.new,
        {
          cwd: "/workspace",
          mcpServers: [],
          _meta: { "bunny-agent": { runner: "nope" } },
        },
      );

      await connection.agent
        .request(methods.agent.session.prompt, {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "hi" }],
        })
        .catch(() => undefined);

      // A cancel after a failed setup must be inert, not act on a stale
      // controller left behind by the failure.
      await expect(
        connection.agent.notify(methods.agent.session.cancel, {
          sessionId: session.sessionId,
        }),
      ).resolves.toBeUndefined();

      // The session is still usable afterwards.
      createRunnerCalls.length = 0;
      const result = await connection.agent
        .request(methods.agent.session.prompt, {
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "hi" }],
        })
        .catch((e) => e);
      // Still the same invalidParams (the bad runner is session state), but the
      // point is the server stayed responsive rather than wedging.
      expect(result).toBeDefined();
    } finally {
      connection.close();
    }
  });
});
