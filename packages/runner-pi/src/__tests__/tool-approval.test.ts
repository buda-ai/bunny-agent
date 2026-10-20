import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { approvalFileName } from "@bunny-agent/manager";
import type { Context } from "@earendil-works/pi-ai";
import {
  createFauxCore,
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  defineTool,
  type InlineExtension,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPiResourceLoader } from "../pi-runner.js";
import {
  type ApprovalGateOptions,
  ASK_USER_QUESTION_TIMEOUT_ANSWER_KEY,
  ASK_USER_QUESTION_TIMEOUT_MESSAGE,
  ASK_USER_QUESTION_TOOL_NAME,
  buildAskUserQuestionTool,
  createToolApprovalExtension,
  DEFAULT_ASK_USER_QUESTION_TIMEOUT_MS,
  LEGACY_ASK_USER_QUESTION_TOOL_NAME,
  MAX_ASK_USER_QUESTIONS,
  waitForApproval,
} from "../tool-approval.js";

let cwd: string;

function approvalFile(toolCallId: string): string {
  return path.join(
    cwd,
    ".bunny-agent",
    "approvals",
    approvalFileName(toolCallId),
  );
}

function completeApproval(
  toolCallId: string,
  questions: unknown,
  answers: Record<string, unknown>,
): void {
  fs.mkdirSync(path.dirname(approvalFile(toolCallId)), { recursive: true });
  fs.writeFileSync(
    approvalFile(toolCallId),
    JSON.stringify({ questions, answers, status: "completed" }),
  );
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-approval-"));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe("waitForApproval", () => {
  it("supports opaque tool call IDs that are unsafe as filenames", async () => {
    const toolCallId = `thought/${"opaque+payload".repeat(80)}`;
    const questions = [{ question: "Format?" }];
    const promise = waitForApproval({
      cwd,
      toolCallId,
      toolName: ASK_USER_QUESTION_TOOL_NAME,
      input: { questions },
      pollIntervalMs: 10,
      timeoutMs: 5_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fs.existsSync(approvalFile(toolCallId))).toBe(true);
    completeApproval(toolCallId, questions, { "Format?": "Video" });

    await expect(promise).resolves.toEqual({
      behavior: "allow",
      updatedInput: { questions, answers: { "Format?": "Video" } },
    });
  });

  it("writes a pending approval file with the claude-compatible shape", async () => {
    const input = { questions: [{ question: "Pick one?" }] };
    const promise = waitForApproval({
      cwd,
      toolCallId: "call-1",
      toolName: ASK_USER_QUESTION_TOOL_NAME,
      input,
      pollIntervalMs: 10,
      timeoutMs: 100,
    });

    // waitForApproval writes the pending file synchronously, before its first
    // await, so it is readable the moment the call returns. Sleeping first
    // would race the timeout, whose cleanup deletes this file.
    const raw = JSON.parse(fs.readFileSync(approvalFile("call-1"), "utf-8"));
    expect(raw).toEqual({
      status: "pending",
      toolName: ASK_USER_QUESTION_TOOL_NAME,
      input,
      questions: input.questions,
      answers: {},
    });

    const decision = await promise;
    expect(decision).toEqual({
      behavior: "allow",
      updatedInput: {
        questions: input.questions,
        answers: {
          [ASK_USER_QUESTION_TIMEOUT_ANSWER_KEY]:
            ASK_USER_QUESTION_TIMEOUT_MESSAGE,
        },
      },
    });
  });

  it("omits questions for regular tools", async () => {
    const promise = waitForApproval({
      cwd,
      toolCallId: "call-2",
      toolName: "bash",
      input: { command: "ls" },
      pollIntervalMs: 10,
      timeoutMs: 100,
    });
    const raw = JSON.parse(fs.readFileSync(approvalFile("call-2"), "utf-8"));
    expect(raw.toolName).toBe("bash");
    expect(raw.input).toEqual({ command: "ls" });
    expect(raw.questions).toBeUndefined();
    await promise;
  });

  it("preserves questions for legacy AskUserQuestion approval files", async () => {
    const input = { questions: [{ question: "Continue?" }] };
    const promise = waitForApproval({
      cwd,
      toolCallId: "call-legacy",
      toolName: LEGACY_ASK_USER_QUESTION_TOOL_NAME,
      input,
      pollIntervalMs: 10,
      timeoutMs: 100,
    });

    const raw = JSON.parse(
      fs.readFileSync(approvalFile("call-legacy"), "utf-8"),
    );
    expect(raw.questions).toEqual(input.questions);
    await promise;
  });

  it("resolves allow with answers when the file is completed", async () => {
    const questions = [{ question: "Language?" }];
    const promise = waitForApproval({
      cwd,
      toolCallId: "call-3",
      toolName: ASK_USER_QUESTION_TOOL_NAME,
      input: { questions },
      pollIntervalMs: 10,
      timeoutMs: 5_000,
    });

    await new Promise((r) => setTimeout(r, 30));
    completeApproval("call-3", questions, { "Language?": "TypeScript" });

    const decision = await promise;
    expect(decision).toEqual({
      behavior: "allow",
      updatedInput: {
        questions,
        answers: { "Language?": "TypeScript" },
      },
    });
    // Approval file is cleaned up after completion.
    expect(fs.existsSync(approvalFile("call-3"))).toBe(false);
  });

  it("denies with a timeout message when no answer arrives", async () => {
    const decision = await waitForApproval({
      cwd,
      toolCallId: "call-4",
      toolName: "bash",
      input: {},
      pollIntervalMs: 10,
      timeoutMs: 50,
    });
    expect(decision).toEqual({
      behavior: "deny",
      message: "Timeout waiting for user input",
    });
    expect(fs.existsSync(approvalFile("call-4"))).toBe(false);
  });

  it("returns partial answers with a timeout marker", async () => {
    const questions = [{ question: "A?" }, { question: "B?" }];
    // Web layer wrote partial answers but never completed. Seeding the file up
    // front keeps this deterministic: waitForApproval only writes its own
    // pending file when none exists, so the first poll reads these answers and
    // the timeout path returns them. Racing the write against the deadline
    // instead makes the test flaky under load.
    fs.mkdirSync(path.dirname(approvalFile("call-5")), { recursive: true });
    fs.writeFileSync(
      approvalFile("call-5"),
      JSON.stringify({
        questions,
        answers: { "A?": "yes" },
        status: "pending",
      }),
    );
    const decision = await waitForApproval({
      cwd,
      toolCallId: "call-5",
      toolName: ASK_USER_QUESTION_TOOL_NAME,
      input: { questions },
      pollIntervalMs: 10,
      timeoutMs: 100,
    });
    expect(decision).toEqual({
      behavior: "allow",
      updatedInput: {
        questions,
        answers: {
          "A?": "yes",
          [ASK_USER_QUESTION_TIMEOUT_ANSWER_KEY]:
            ASK_USER_QUESTION_TIMEOUT_MESSAGE,
        },
      },
    });
  });

  it("stops polling and denies when the signal aborts", async () => {
    const controller = new AbortController();
    const start = Date.now();
    const promise = waitForApproval({
      cwd,
      toolCallId: "call-6",
      toolName: "bash",
      input: {},
      signal: controller.signal,
      pollIntervalMs: 50,
      timeoutMs: 60_000,
    });
    setTimeout(() => controller.abort(), 30);
    const decision = await promise;
    expect(decision).toEqual({
      behavior: "deny",
      message: "Aborted while waiting for user approval",
    });
    expect(Date.now() - start).toBeLessThan(5_000);
    expect(fs.existsSync(approvalFile("call-6"))).toBe(false);
  });
});

describe("buildAskUserQuestionTool", () => {
  it("uses a three-minute default timeout and caps surveys at eight questions", () => {
    const tool = buildAskUserQuestionTool({ cwd });
    const parameters = tool.parameters as {
      properties: { questions: { maxItems?: number } };
    };

    expect(DEFAULT_ASK_USER_QUESTION_TIMEOUT_MS).toBe(180_000);
    expect(MAX_ASK_USER_QUESTIONS).toBe(8);
    expect(parameters.properties.questions.maxItems).toBe(8);
  });

  it("rejects oversized surveys when execution bypasses schema validation", async () => {
    const tool = buildAskUserQuestionTool({ cwd });
    const questions = Array.from({ length: 9 }, (_, index) => ({
      question: `Question ${index + 1}?`,
    }));

    await expect(
      tool.execute(
        "ask-too-many",
        { questions },
        undefined,
        undefined,
        // biome-ignore lint/suspicious/noExplicitAny: ExtensionContext unused in execute
        undefined as any,
      ),
    ).rejects.toThrow("at most 8 questions");
  });

  it("returns the user's answers as the tool result on completion", async () => {
    const tool = buildAskUserQuestionTool({
      cwd,
      pollIntervalMs: 10,
      timeoutMs: 5_000,
    });
    expect(tool.name).toBe(ASK_USER_QUESTION_TOOL_NAME);

    const questions = [{ question: "Deploy?" }];
    const promise = tool.execute(
      "ask-1",
      { questions },
      undefined,
      undefined,
      // biome-ignore lint/suspicious/noExplicitAny: ExtensionContext unused in execute
      undefined as any,
    );
    await new Promise((r) => setTimeout(r, 30));
    completeApproval("ask-1", questions, { "Deploy?": "Yes" });

    const result = await promise;
    expect(result.content).toEqual([
      {
        type: "text",
        text: [
          "The user answered the interactive questions.",
          'Answers: {"Deploy?":"Yes"}',
          "Continue the original task using these answers and provide a user-visible response. Do not end the turn with an empty response.",
        ].join("\n"),
      },
    ]);
    expect(result.details).toEqual({
      questions,
      answers: { "Deploy?": "Yes" },
    });
  });

  it("returns a timeout result so the model can continue", async () => {
    const tool = buildAskUserQuestionTool({
      cwd,
      pollIntervalMs: 10,
      timeoutMs: 50,
    });
    const questions = [{ question: "Q?" }];
    const result = await tool.execute(
      "ask-2",
      { questions },
      undefined,
      undefined,
      // biome-ignore lint/suspicious/noExplicitAny: ExtensionContext unused in execute
      undefined as any,
    );
    expect(result.content).toEqual([
      {
        type: "text",
        text: [
          ASK_USER_QUESTION_TIMEOUT_MESSAGE,
          "Available answers: {}",
          "Continue the original task without waiting. Use any available answers, make reasonable assumptions when safe, and provide a user-visible response. Do not call ask_user_question again during this turn.",
        ].join("\n"),
      },
    ]);
    expect(result.details).toEqual({
      questions,
      answers: {
        [ASK_USER_QUESTION_TIMEOUT_ANSWER_KEY]:
          ASK_USER_QUESTION_TIMEOUT_MESSAGE,
      },
    });

    const secondStartedAt = Date.now();
    const secondResult = await tool.execute(
      "ask-3",
      { questions: [{ question: "Another question?" }] },
      undefined,
      undefined,
      // biome-ignore lint/suspicious/noExplicitAny: ExtensionContext unused in execute
      undefined as any,
    );
    expect(Date.now() - secondStartedAt).toBeLessThan(25);
    expect(secondResult.details).toMatchObject({
      answers: {
        [ASK_USER_QUESTION_TIMEOUT_ANSWER_KEY]:
          ASK_USER_QUESTION_TIMEOUT_MESSAGE,
      },
    });
  });
});

describe("createToolApprovalExtension (real pi session)", () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Answer every pending approval file as the web layer would; records what was asked. */
  function startApprover() {
    const asked: string[] = [];
    const dir = path.join(cwd, ".bunny-agent", "approvals");
    let stopped = false;
    const loop = (async () => {
      while (!stopped) {
        for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
          const file = path.join(dir, name);
          try {
            const data = JSON.parse(fs.readFileSync(file, "utf-8"));
            if (data.status !== "pending") continue;
            asked.push(data.toolName);
            fs.writeFileSync(
              file,
              JSON.stringify({
                ...data,
                status: "completed",
                answers: { "Proceed?": "yes" },
              }),
            );
          } catch {
            // Mid-write or already cleaned up; next poll picks it up.
          }
        }
        await sleep(10);
      }
    })();
    return {
      asked,
      stop: async () => {
        stopped = true;
        await loop;
      },
    };
  }

  /** Run one prompt where the model calls `toolName`, then finishes. */
  async function runToolCall(options: {
    toolName: string;
    args?: Parameters<typeof fauxToolCall>[1];
    gate?: Partial<ApprovalGateOptions>;
    customTools?: ToolDefinition[];
    extensions?: InlineExtension[];
    abortAfterMs?: number;
  }): Promise<{ seenResult: string }> {
    const faux = createFauxCore({
      api: "faux-approval",
      provider: "faux-approval",
      models: [{ id: "faux-model", contextWindow: 100_000, maxTokens: 1_000 }],
    });
    let seenResult = "";
    faux.setResponses([
      fauxAssistantMessage(
        fauxToolCall(options.toolName, options.args ?? {}, { id: "call-1" }),
        { stopReason: "toolUse" },
      ),
      (context: Context) => {
        seenResult = JSON.stringify(context.messages.at(-1));
        return fauxAssistantMessage("done");
      },
    ]);
    const modelRuntime = await ModelRuntime.create({
      modelsPath: null,
      allowModelNetwork: false,
    });
    modelRuntime.registerProvider("faux-approval", {
      baseUrl: "http://localhost",
      apiKey: "test-key",
      api: "faux-approval",
      streamSimple: faux.streamSimple,
      models: [
        {
          id: "faux-model",
          name: "faux-model",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 100_000,
          maxTokens: 1_000,
        },
      ],
    });
    const agentDir = path.join(cwd, "agent");
    const resourceLoader = await createPiResourceLoader({
      cwd,
      agentDir,
      extensionFactories: [
        createToolApprovalExtension({
          cwd,
          pollIntervalMs: 10,
          ...options.gate,
        }),
        ...(options.extensions ?? []),
      ],
    });
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      model: modelRuntime.getModel("faux-approval", "faux-model"),
      modelRuntime,
      resourceLoader,
      sessionManager: SessionManager.inMemory(cwd),
      settingsManager: SettingsManager.inMemory({ retry: { enabled: false } }),
      noTools: "builtin",
      customTools: options.customTools,
    });
    try {
      await session.bindExtensions({ mode: "print" });
      if (options.abortAfterMs !== undefined) {
        setTimeout(() => void session.abort(), options.abortAfterMs);
      }
      await session.prompt("go");
    } finally {
      session.dispose();
    }
    return { seenResult };
  }

  const countingTool = (name: string, calls: string[]) =>
    defineTool({
      name,
      label: name,
      description: `${name} tool`,
      parameters: Type.Object({}),
      execute: async () => {
        calls.push(name);
        return {
          content: [{ type: "text", text: `${name} ran` }],
          details: undefined,
        };
      },
    });

  it("gates tools registered by extensions, such as MCP adapters", async () => {
    const calls: string[] = [];
    const approver = startApprover();
    try {
      const { seenResult } = await runToolCall({
        toolName: "ext_tool",
        extensions: [
          {
            name: "test-ext",
            factory: (pi) => pi.registerTool(countingTool("ext_tool", calls)),
          },
        ],
      });
      expect(seenResult).toContain("ext_tool ran");
    } finally {
      await approver.stop();
    }
    expect(approver.asked).toEqual(["ext_tool"]);
    expect(calls).toEqual(["ext_tool"]);
  });

  it("blocks the call and tells the model when approval times out", async () => {
    const calls: string[] = [];
    const { seenResult } = await runToolCall({
      toolName: "bash_like",
      gate: { timeoutMs: 50 },
      customTools: [countingTool("bash_like", calls)],
    });
    expect(calls).toEqual([]);
    expect(seenResult).toContain(
      'Tool \\"bash_like\\" was not approved: Timeout waiting for user input',
    );
  });

  it("stops waiting and skips the call when the run is aborted", async () => {
    const calls: string[] = [];
    await runToolCall({
      toolName: "bash_like",
      abortAfterMs: 50,
      customTools: [countingTool("bash_like", calls)],
    });
    expect(calls).toEqual([]);
    expect(fs.existsSync(approvalFile("call-1"))).toBe(false);
  });

  it("does not ask again for calls a tool makes on behalf of an approved call", async () => {
    const calls: string[] = [];
    const outer = defineTool({
      name: "outer",
      label: "outer",
      description: "calls inner",
      parameters: Type.Object({}),
      execute: async (_id, _params, signal, _onUpdate, ctx) => {
        calls.push("outer");
        await ctx.executeTool("inner", {}, { signal });
        return {
          content: [{ type: "text", text: "outer ran" }],
          details: undefined,
        };
      },
    });
    const approver = startApprover();
    try {
      await runToolCall({
        toolName: "outer",
        customTools: [outer, countingTool("inner", calls)],
      });
    } finally {
      await approver.stop();
    }
    expect(approver.asked).toEqual(["outer"]);
    expect(calls).toEqual(["outer", "inner"]);
  });

  it("leaves ask_user_question to its own approval round", async () => {
    const approver = startApprover();
    try {
      const { seenResult } = await runToolCall({
        toolName: ASK_USER_QUESTION_TOOL_NAME,
        args: { questions: [{ question: "Proceed?" }] },
        customTools: [buildAskUserQuestionTool({ cwd, pollIntervalMs: 10 })],
      });
      expect(seenResult).toContain(
        "The user answered the interactive questions.",
      );
    } finally {
      await approver.stop();
    }
    expect(approver.asked).toEqual([ASK_USER_QUESTION_TOOL_NAME]);
  });
});
