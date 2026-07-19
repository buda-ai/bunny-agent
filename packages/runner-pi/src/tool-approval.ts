/**
 * Human-in-the-loop tool approval for the pi runner.
 *
 * Mirrors runner-claude's `createCanUseToolCallback` file-based bridge:
 * - Writes a pending approval request to
 *   `{cwd}/.bunny-agent/approvals/{toolCallId}.json` with the exact same JSON
 *   shape claude writes ({ status, toolName, input, questions?, answers }),
 *   so the SDK's question-processor / AskUserQuestion web UI works unchanged.
 * - Polls the file every 500ms waiting for the web layer to overwrite it with
 *   `status: "completed"` (see packages/sdk submitAnswer). By default it waits
 *   indefinitely, matching runner-claude — only aborting the session signal
 *   stops polling and denies. An optional `timeoutMs` bound exists for tests.
 * - On completion returns `{ questions, answers }`; if a finite `timeoutMs`
 *   elapses with partial answers it returns those, otherwise denies.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export const ASK_USER_QUESTION_TOOL_NAME = "AskUserQuestion";

/** Same poll cadence as runner-claude's approval bridge. */
export const DEFAULT_POLL_INTERVAL_MS = 500;

export type ApprovalDecision =
  | {
      behavior: "allow";
      /** `{ questions, answers }` from the approval file, like claude's updatedInput. */
      updatedInput: { questions: unknown; answers: Record<string, unknown> };
    }
  | { behavior: "deny"; message: string };

export interface WaitForApprovalOptions {
  cwd: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  /** Session abort signal; aborting stops polling and denies. */
  signal?: AbortSignal;
  pollIntervalMs?: number;
  /**
   * Optional upper bound on how long to wait. Omitted (the default) waits
   * indefinitely for the user's answer, matching runner-claude; only the abort
   * signal ends the wait. Primarily useful for tests.
   */
  timeoutMs?: number;
}

function approvalFilePath(cwd: string, toolCallId: string): string {
  return path.join(cwd, ".bunny-agent", "approvals", `${toolCallId}.json`);
}

/**
 * Write the pending approval file and poll it until the web layer marks it
 * completed, the timeout elapses, or the signal aborts.
 */
export async function waitForApproval(
  options: WaitForApprovalOptions,
): Promise<ApprovalDecision> {
  const {
    cwd,
    toolCallId,
    toolName,
    input,
    signal,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs,
  } = options;

  const approvalFile = approvalFilePath(cwd, toolCallId);

  const cleanup = () => {
    try {
      fs.unlinkSync(approvalFile);
    } catch {
      // Ignore cleanup errors
    }
  };

  try {
    // Write pending file so the frontend knows a tool is waiting for approval.
    // Shape matches runner-claude exactly.
    fs.mkdirSync(path.dirname(approvalFile), { recursive: true });
    if (!fs.existsSync(approvalFile)) {
      fs.writeFileSync(
        approvalFile,
        JSON.stringify({
          status: "pending",
          toolName,
          input,
          questions:
            toolName === ASK_USER_QUESTION_TOOL_NAME
              ? (input as Record<string, unknown>)?.questions
              : undefined,
          answers: {},
        }),
      );
    }

    const deadline =
      timeoutMs === undefined
        ? Number.POSITIVE_INFINITY
        : Date.now() + timeoutMs;
    let lastApproval: {
      questions: unknown;
      answers: Record<string, unknown>;
      status: string;
    } | null = null;

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        cleanup();
        return {
          behavior: "deny",
          message: "Aborted while waiting for user approval",
        };
      }

      try {
        const data = fs.readFileSync(approvalFile, "utf-8");
        const approval = JSON.parse(data) as {
          questions: unknown;
          answers: Record<string, unknown>;
          status: string;
        };
        lastApproval = approval;

        if (approval.status === "completed") {
          cleanup();
          return {
            behavior: "allow",
            updatedInput: {
              questions: approval.questions,
              answers: approval.answers ?? {},
            },
          };
        }
      } catch {
        // File doesn't exist yet or can't be read, continue waiting
      }

      await sleepWithAbort(pollIntervalMs, signal);
    }

    cleanup();

    if (lastApproval && Object.keys(lastApproval.answers ?? {}).length > 0) {
      // Return partial answers on timeout, like runner-claude.
      return {
        behavior: "allow",
        updatedInput: {
          questions: lastApproval.questions,
          answers: lastApproval.answers,
        },
      };
    }
    return { behavior: "deny", message: "Timeout waiting for user input" };
  } catch (error) {
    console.error("Failed to handle approval flow:", error);
    return { behavior: "deny", message: "Failed to handle approval flow" };
  }
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const askUserQuestionParameters = Type.Object({
  questions: Type.Array(
    Type.Object({
      question: Type.String({ description: "The question to ask the user." }),
      header: Type.Optional(
        Type.String({ description: "Short header shown above the question." }),
      ),
      options: Type.Optional(
        Type.Array(
          Type.Object({
            label: Type.String(),
            description: Type.Optional(Type.String()),
          }),
          { description: "Predefined answer options." },
        ),
      ),
      multiSelect: Type.Optional(
        Type.Boolean({
          description: "Allow selecting multiple options.",
        }),
      ),
    }),
    { description: "Questions to present to the user." },
  ),
});

export interface ApprovalGateOptions {
  cwd: string;
  /** Fallback abort signal (session abort controller). */
  fallbackSignal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/**
 * Build the AskUserQuestion custom tool. Its execute() blocks on the approval
 * file bridge and returns the user's answers as the tool result. This tool is
 * ALWAYS gated, regardless of yolo mode — same as runner-claude.
 */
export function buildAskUserQuestionTool(
  options: ApprovalGateOptions,
): ToolDefinition {
  return {
    name: ASK_USER_QUESTION_TOOL_NAME,
    label: "Ask User Question",
    description:
      "Ask the user one or more questions and wait for their answers. " +
      "Use this when you need clarification, a decision between options, or " +
      "missing information required to continue the task.",
    parameters: askUserQuestionParameters,
    async execute(toolCallId, params, signal) {
      const decision = await waitForApproval({
        cwd: options.cwd,
        toolCallId,
        toolName: ASK_USER_QUESTION_TOOL_NAME,
        input: params,
        signal: signal ?? options.fallbackSignal,
        pollIntervalMs: options.pollIntervalMs,
        timeoutMs: options.timeoutMs,
      });
      if (decision.behavior === "deny") {
        throw new Error(decision.message);
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(decision.updatedInput),
          },
        ],
        details: undefined,
      };
    },
  };
}

/**
 * Minimal tool shape we need to wrap. Compatible with pi's ToolDefinition and
 * the AgentTool objects returned by createCodingTools.
 */
interface WrappableTool {
  name: string;
  label?: string;
  description: string;
  parameters: unknown;
  execute(...args: unknown[]): Promise<unknown>;
}

/**
 * Wrap a tool so its execution requires user approval via the file bridge.
 * On approval the tool runs with its ORIGINAL params (the approval file's
 * questions/answers payload is only meaningful for AskUserQuestion); on
 * denial or timeout the tool call fails with an error result.
 */
export function wrapToolWithApproval(
  tool: WrappableTool,
  options: ApprovalGateOptions,
): ToolDefinition {
  return {
    name: tool.name,
    label: tool.label ?? tool.name,
    description: tool.description,
    parameters: tool.parameters as ToolDefinition["parameters"],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const decision = await waitForApproval({
        cwd: options.cwd,
        toolCallId,
        toolName: tool.name,
        input: params,
        signal: signal ?? options.fallbackSignal,
        pollIntervalMs: options.pollIntervalMs,
        timeoutMs: options.timeoutMs,
      });
      if (decision.behavior === "deny") {
        throw new Error(
          `Tool "${tool.name}" was not approved: ${decision.message}`,
        );
      }
      // biome-ignore lint/suspicious/noExplicitAny: delegate to the wrapped tool's execute
      return (tool as any).execute(toolCallId, params, signal, onUpdate, ctx);
    },
  };
}

/**
 * Apply the approval gate to a set of regular tools.
 *
 * Mirrors runner-claude's semantics: when `bypass` is false EVERY tool
 * execution requires approval; when `bypass` is true the tools run unmodified.
 * The caller computes `bypass` from `yolo || isRoot` (see pi-runner), matching
 * how claude switches to `bypassPermissions`. AskUserQuestion is not handled
 * here — it is built via {@link buildAskUserQuestionTool} and is always gated.
 */
export function gateToolsForApproval(
  tools: ToolDefinition[],
  bypass: boolean | undefined,
  options: ApprovalGateOptions,
): ToolDefinition[] {
  if (bypass) return tools;
  return tools.map((tool) => wrapToolWithApproval(tool, options));
}
