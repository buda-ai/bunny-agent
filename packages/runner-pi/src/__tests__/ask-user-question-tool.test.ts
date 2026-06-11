import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAskUserQuestionTool,
  sanitizeToolCallId,
} from "../ask-user-question-tool.js";

// ---------------------------------------------------------------------------
// AskUserQuestion tool — drives the approval file from a sibling task to
// simulate the frontend writing the user's answer.
// ---------------------------------------------------------------------------

const APPROVAL_REL = join(".bunny-agent", "approvals");
const ESC = String.fromCharCode(0x1b);

const sampleQuestion = {
  question: "Which database should we use?",
  header: "Database",
  multiSelect: false,
  options: [
    { label: "Postgres", description: "Relational, mature, default choice." },
    { label: "MySQL", description: "Relational, common in legacy stacks." },
  ],
};

function makeTool(
  cwd: string,
  overrides: { timeoutMs?: number; pollMs?: number } = {},
) {
  return buildAskUserQuestionTool({
    cwd,
    timeoutMs: overrides.timeoutMs ?? 1_000,
    pollMs: overrides.pollMs ?? 10,
  });
}

function approvalPath(cwd: string, toolCallId: string): string {
  return join(cwd, APPROVAL_REL, `${sanitizeToolCallId(toolCallId)}.json`);
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("waitFor timed out");
}

describe("buildAskUserQuestionTool", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "ask-user-question-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("declares the ask_user_question contract", () => {
    const tool = makeTool(cwd);
    expect(tool.name).toBe("ask_user_question");
    expect(tool.executionMode).toBe("sequential");
    expect(tool.description).toMatch(/multiple-choice/i);
  });

  it("returns the user's answer once the frontend completes the approval", async () => {
    const tool = makeTool(cwd);
    const toolCallId = "call-happy";
    const file = approvalPath(cwd, toolCallId);

    const exec = tool.execute(
      toolCallId,
      { questions: [sampleQuestion] },
      undefined,
      undefined,
      undefined as never,
    );

    await waitFor(() => {
      try {
        const pending = JSON.parse(readFileSync(file, "utf-8"));
        return pending.status === "pending";
      } catch {
        return false;
      }
    });

    writeFileSync(
      file,
      JSON.stringify({
        status: "completed",
        toolName: "ask_user_question",
        questions: [sampleQuestion],
        answers: { [sampleQuestion.question]: "Postgres" },
      }),
    );

    const result = await exec;
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("User answered:");
    expect(text).toContain("Postgres");
  });

  it("returns multi-select answers joined", async () => {
    const tool = makeTool(cwd);
    const toolCallId = "call-multi";
    const file = approvalPath(cwd, toolCallId);
    const q = { ...sampleQuestion, multiSelect: true };

    const exec = tool.execute(
      toolCallId,
      { questions: [q] },
      undefined,
      undefined,
      undefined as never,
    );
    await waitFor(() => {
      try {
        return JSON.parse(readFileSync(file, "utf-8")).status === "pending";
      } catch {
        return false;
      }
    });

    writeFileSync(
      file,
      JSON.stringify({
        status: "completed",
        toolName: "ask_user_question",
        questions: [q],
        answers: { [q.question]: ["Postgres", "MySQL"] },
      }),
    );

    const result = await exec;
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("Postgres, MySQL");
  });

  it("reports a decline reason when the frontend declines", async () => {
    const tool = makeTool(cwd);
    const toolCallId = "call-decline";
    const file = approvalPath(cwd, toolCallId);

    const exec = tool.execute(
      toolCallId,
      { questions: [sampleQuestion] },
      undefined,
      undefined,
      undefined as never,
    );
    await waitFor(() => {
      try {
        return JSON.parse(readFileSync(file, "utf-8")).status === "pending";
      } catch {
        return false;
      }
    });

    writeFileSync(
      file,
      JSON.stringify({
        status: "declined",
        toolName: "ask_user_question",
        questions: [sampleQuestion],
        answers: {},
        reason: "user_dismissed",
      }),
    );

    const result = await exec;
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("user_dismissed");
    expect(text).toMatch(/did not answer/i);
  });

  it("returns timeout when the frontend never responds", async () => {
    const tool = makeTool(cwd, { timeoutMs: 50, pollMs: 10 });
    const result = await tool.execute(
      "call-timeout",
      { questions: [sampleQuestion] },
      undefined,
      undefined,
      undefined as never,
    );
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("timeout");
  });

  it("respects an aborted signal", async () => {
    const tool = makeTool(cwd, { timeoutMs: 5_000, pollMs: 10 });
    const ctrl = new AbortController();
    const exec = tool.execute(
      "call-abort",
      { questions: [sampleQuestion] },
      ctrl.signal,
      undefined,
      undefined as never,
    );
    setTimeout(() => ctrl.abort(), 25);
    const result = await exec;
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("run_aborted");
  });

  it("sanitizes ANSI escapes from question text before writing the approval file", async () => {
    const tool = makeTool(cwd, { timeoutMs: 50, pollMs: 10 });
    const toolCallId = "call-sanitize";
    const file = approvalPath(cwd, toolCallId);
    const dirty = {
      // \x1b[31m is the red ANSI escape; should be stripped.
      question: `${ESC}[31mWhich DB?${ESC}[0m`,
      header: "DB",
      multiSelect: false,
      options: [
        { label: "Postgres", description: "ok" },
        { label: "MySQL", description: "ok" },
      ],
    };
    let captured: { question?: string } = {};
    void tool
      .execute(
        toolCallId,
        { questions: [dirty] },
        undefined,
        undefined,
        undefined as never,
      )
      .catch(() => undefined);

    await waitFor(() => {
      try {
        const pending = JSON.parse(readFileSync(file, "utf-8"));
        captured = pending.questions?.[0] ?? {};
        return Boolean(captured.question);
      } catch {
        return false;
      }
    });

    expect(captured.question).toBe("Which DB?");
    expect(captured.question ?? "").not.toContain(ESC);
  });

  it("cleans up the approval file after each call", async () => {
    const tool = makeTool(cwd, { timeoutMs: 50, pollMs: 10 });
    await tool.execute(
      "call-cleanup",
      { questions: [sampleQuestion] },
      undefined,
      undefined,
      undefined as never,
    );
    const file = approvalPath(cwd, "call-cleanup");
    expect(() => readFileSync(file)).toThrow();
  });
});
