import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ASK_USER_QUESTION_TOOL_NAME,
  buildAskUserQuestionTool,
  waitForApproval,
  wrapToolWithApproval,
} from "../tool-approval.js";

let cwd: string;

function approvalFile(toolCallId: string): string {
  return path.join(cwd, ".bunny-agent", "approvals", `${toolCallId}.json`);
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

    // Give the synchronous write a tick, then inspect the file.
    await new Promise((r) => setTimeout(r, 20));
    const raw = JSON.parse(fs.readFileSync(approvalFile("call-1"), "utf-8"));
    expect(raw).toEqual({
      status: "pending",
      toolName: ASK_USER_QUESTION_TOOL_NAME,
      input,
      questions: input.questions,
      answers: {},
    });

    const decision = await promise;
    expect(decision.behavior).toBe("deny");
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
    await new Promise((r) => setTimeout(r, 20));
    const raw = JSON.parse(fs.readFileSync(approvalFile("call-2"), "utf-8"));
    expect(raw.toolName).toBe("bash");
    expect(raw.input).toEqual({ command: "ls" });
    expect(raw.questions).toBeUndefined();
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

  it("returns partial answers on timeout, like runner-claude", async () => {
    const questions = [{ question: "A?" }, { question: "B?" }];
    const promise = waitForApproval({
      cwd,
      toolCallId: "call-5",
      toolName: ASK_USER_QUESTION_TOOL_NAME,
      input: { questions },
      pollIntervalMs: 10,
      timeoutMs: 100,
    });
    await new Promise((r) => setTimeout(r, 20));
    // Web layer wrote partial answers but never completed.
    fs.writeFileSync(
      approvalFile("call-5"),
      JSON.stringify({
        questions,
        answers: { "A?": "yes" },
        status: "pending",
      }),
    );
    const decision = await promise;
    expect(decision).toEqual({
      behavior: "allow",
      updatedInput: { questions, answers: { "A?": "yes" } },
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
        text: JSON.stringify({ questions, answers: { "Deploy?": "Yes" } }),
      },
    ]);
  });

  it("throws on timeout so the tool call fails", async () => {
    const tool = buildAskUserQuestionTool({
      cwd,
      pollIntervalMs: 10,
      timeoutMs: 50,
    });
    await expect(
      tool.execute(
        "ask-2",
        { questions: [{ question: "Q?" }] },
        undefined,
        undefined,
        // biome-ignore lint/suspicious/noExplicitAny: ExtensionContext unused in execute
        undefined as any,
      ),
    ).rejects.toThrow("Timeout waiting for user input");
  });
});

describe("wrapToolWithApproval", () => {
  const makeInnerTool = () => {
    const calls: unknown[][] = [];
    return {
      calls,
      tool: {
        name: "bash",
        label: "bash",
        description: "run a command",
        parameters: {},
        async execute(...args: unknown[]) {
          calls.push(args);
          return {
            content: [{ type: "text", text: "ok" }],
            details: undefined,
          };
        },
      },
    };
  };

  it("executes the wrapped tool with original params after approval", async () => {
    const { tool, calls } = makeInnerTool();
    const wrapped = wrapToolWithApproval(tool, {
      cwd,
      pollIntervalMs: 10,
      timeoutMs: 5_000,
    });
    const promise = wrapped.execute(
      "wrap-1",
      { command: "ls" },
      undefined,
      undefined,
      // biome-ignore lint/suspicious/noExplicitAny: ExtensionContext unused in execute
      undefined as any,
    );
    await new Promise((r) => setTimeout(r, 30));
    completeApproval("wrap-1", undefined, { approved: "yes" });

    const result = await promise;
    expect(result.content).toEqual([{ type: "text", text: "ok" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("wrap-1");
    expect(calls[0][1]).toEqual({ command: "ls" });
  });

  it("does not execute the wrapped tool when approval times out", async () => {
    const { tool, calls } = makeInnerTool();
    const wrapped = wrapToolWithApproval(tool, {
      cwd,
      pollIntervalMs: 10,
      timeoutMs: 50,
    });
    await expect(
      wrapped.execute(
        "wrap-2",
        { command: "rm -rf /" },
        undefined,
        undefined,
        // biome-ignore lint/suspicious/noExplicitAny: ExtensionContext unused in execute
        undefined as any,
      ),
    ).rejects.toThrow('Tool "bash" was not approved');
    expect(calls).toHaveLength(0);
  });

  it("denies when aborted while waiting", async () => {
    const { tool, calls } = makeInnerTool();
    const controller = new AbortController();
    const wrapped = wrapToolWithApproval(tool, {
      cwd,
      fallbackSignal: controller.signal,
      pollIntervalMs: 50,
      timeoutMs: 60_000,
    });
    const promise = wrapped.execute(
      "wrap-3",
      { command: "ls" },
      undefined,
      undefined,
      // biome-ignore lint/suspicious/noExplicitAny: ExtensionContext unused in execute
      undefined as any,
    );
    setTimeout(() => controller.abort(), 30);
    await expect(promise).rejects.toThrow(
      "Aborted while waiting for user approval",
    );
    expect(calls).toHaveLength(0);
  });
});
