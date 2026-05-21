/**
 * AskUserQuestion tool for the pi runner.
 *
 * Lets the model surface a structured choice to the user mid-run, mirroring
 * Claude Code's `AskUserQuestion`. The tool writes an approval file under
 * `<cwd>/.bunny-agent/approvals/<toolCallId>.json` that uses the same shape as
 * `runner-claude`'s `canUseTool` flow, so any frontend already wired for
 * Claude Code approvals can answer pi questions without changes.
 *
 * Display text (question / header / option labels) is sanitized before being
 * written to disk to keep ANSI escapes and other control characters out of the
 * UI — same defensive cleanup openclaw applies to its MCP elicitation bridge.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

const TOOL_NAME = "AskUserQuestion";
const APPROVAL_DIR = join(".bunny-agent", "approvals");

export const ASK_USER_QUESTION_TIMEOUT_MS = 120_000;
export const ASK_USER_QUESTION_POLL_MS = 500;

const MAX_QUESTIONS = 4;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_HEADER_LEN = 12;
const MAX_QUESTION_LEN = 500;
const MAX_OPTION_LABEL_LEN = 80;
const MAX_OPTION_DESCRIPTION_LEN = 240;

// ANSI/control-character scrubbers, mirrored from openclaw's elicitation
// bridge (extensions/codex/src/app-server/elicitation-bridge.ts). Built from
// String.fromCharCode so the source itself stays free of control bytes and
// Biome accepts the patterns; passing a non-literal string also keeps
// useRegexLiterals from rewriting them back into raw control characters.
const ESC = String.fromCharCode(0x1b);
const CSI = String.fromCharCode(0x9b);
const ST = String.fromCharCode(0x9c);
const OSC = String.fromCharCode(0x9d);
const BEL = String.fromCharCode(0x07);
const ANSI_OSC_RE = new RegExp(
  `(?:${ESC}\\]|${OSC})[^${ESC}${ST}${BEL}]*(?:${BEL}|${ESC}\\\\|${ST})`,
  "g",
);
const ANSI_CTL_RE = new RegExp(
  `(?:${ESC}\\[[0-?]*[ -/]*[@-~]|${CSI}[0-?]*[ -/]*[@-~]|${ESC}[@-Z\\\\\\-_])`,
  "g",
);
const CTL_CHAR_RE = new RegExp(
  `[${String.fromCharCode(0x00)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}-${String.fromCharCode(0x9f)}]+`,
  "g",
);

interface AskUserQuestionOption {
  label: string;
  description: string;
}

interface AskUserQuestionItem {
  question: string;
  header: string;
  multiSelect: boolean;
  options: AskUserQuestionOption[];
}

export interface AskUserQuestionParams {
  questions: AskUserQuestionItem[];
}

type ApprovalStatus = "pending" | "completed" | "declined" | "cancelled";

interface ApprovalFile {
  status: ApprovalStatus;
  toolName: string;
  input: AskUserQuestionParams;
  questions: AskUserQuestionItem[];
  answers: Record<string, string | string[]>;
  reason?: string;
}

const askUserQuestionSchema = {
  type: "object",
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: MAX_QUESTIONS,
      description: `Between 1 and ${MAX_QUESTIONS} questions to ask the user.`,
      items: {
        type: "object",
        required: ["question", "header", "multiSelect", "options"],
        properties: {
          question: {
            type: "string",
            description:
              "The full question to ask the user. Should be specific, end with a question mark, and avoid jargon the user has not used.",
          },
          header: {
            type: "string",
            description: `Short label (max ${MAX_HEADER_LEN} chars) shown as a chip/tag in the UI. Examples: "Library", "Auth method", "Approach".`,
          },
          multiSelect: {
            type: "boolean",
            description:
              "Set true when the choices are not mutually exclusive and the user may select more than one.",
          },
          options: {
            type: "array",
            minItems: MIN_OPTIONS,
            maxItems: MAX_OPTIONS,
            description: `Between ${MIN_OPTIONS} and ${MAX_OPTIONS} mutually exclusive options. Do not add an "Other" option — the host adds one automatically.`,
            items: {
              type: "object",
              required: ["label", "description"],
              properties: {
                label: {
                  type: "string",
                  description:
                    "Display text for the option (1-5 words). Should clearly describe the choice.",
                },
                description: {
                  type: "string",
                  description:
                    "What this option means or what happens if chosen — call out trade-offs.",
                },
              },
            },
          },
        },
      },
    },
  },
};

const TOOL_DESCRIPTION = `Ask the user one or more multiple-choice questions when the task is genuinely ambiguous and you need user input to proceed (choosing between libraries, design approaches, trade-offs, etc.). Each question carries 2-${MAX_OPTIONS} options; up to ${MAX_QUESTIONS} questions per call. The user can also select an automatically-provided "Other" option to give free-form input. Use sparingly — prefer making a sensible default choice when the task is clear.`;

function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(ANSI_OSC_RE, "")
    .replace(ANSI_CTL_RE, "")
    .replace(CTL_CHAR_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number): string {
  return value.length <= max
    ? value
    : `${value.slice(0, Math.max(0, max - 3))}...`;
}

function sanitizeQuestions(
  questions: AskUserQuestionItem[],
): AskUserQuestionItem[] {
  return questions.map((q) => ({
    question: truncate(sanitizeText(q.question), MAX_QUESTION_LEN),
    header: truncate(sanitizeText(q.header), MAX_HEADER_LEN),
    multiSelect: !!q.multiSelect,
    options: q.options.map((o) => ({
      label: truncate(sanitizeText(o.label), MAX_OPTION_LABEL_LEN),
      description: truncate(
        sanitizeText(o.description),
        MAX_OPTION_DESCRIPTION_LEN,
      ),
    })),
  }));
}

function readApproval(file: string): ApprovalFile | undefined {
  try {
    const raw = readFileSync(file, "utf-8");
    return JSON.parse(raw) as ApprovalFile;
  } catch {
    return undefined;
  }
}

function safeUnlink(file: string): void {
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch {
    // Best-effort cleanup; the approval directory is recreated each call.
  }
}

interface PollOutcome {
  kind: "answered" | "declined" | "cancelled" | "timeout" | "aborted";
  answers: Record<string, string | string[]>;
  reason?: string;
}

/**
 * Wait for the frontend to update the approval file. Resolves as soon as the
 * status flips away from "pending", the deadline elapses, or the abort signal
 * fires. Internal polling cadence is fixed at {@link ASK_USER_QUESTION_POLL_MS}.
 */
export async function pollApprovalFile(
  approvalFile: string,
  signal: AbortSignal | undefined,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<PollOutcome> {
  const timeoutMs = options.timeoutMs ?? ASK_USER_QUESTION_TIMEOUT_MS;
  const pollMs = options.pollMs ?? ASK_USER_QUESTION_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastApproval: ApprovalFile | undefined;

  while (true) {
    if (signal?.aborted) {
      return { kind: "aborted", answers: lastApproval?.answers ?? {} };
    }

    const approval = readApproval(approvalFile);
    if (approval) lastApproval = approval;

    if (approval && approval.status !== "pending") {
      const answers = approval.answers ?? {};
      if (approval.status === "completed" && Object.keys(answers).length > 0) {
        return { kind: "answered", answers };
      }
      if (approval.status === "declined") {
        return { kind: "declined", answers, reason: approval.reason };
      }
      if (approval.status === "cancelled") {
        return { kind: "cancelled", answers, reason: approval.reason };
      }
      // status === "completed" with empty answers means the user dismissed
      // without choosing. Treat as decline.
      return {
        kind: "declined",
        answers,
        reason: approval.reason ?? "no_answer_provided",
      };
    }

    if (Date.now() >= deadline) {
      // Salvage partial answers if the frontend wrote some before timing out.
      const partial = lastApproval?.answers ?? {};
      return {
        kind: Object.keys(partial).length > 0 ? "answered" : "timeout",
        answers: partial,
      };
    }

    await sleepWithAbort(
      Math.min(pollMs, Math.max(0, deadline - Date.now())),
      signal,
    );
  }
}

function sleepWithAbort(
  ms: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) {
      resolve();
      return;
    }
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function formatAcceptedText(
  questions: AskUserQuestionItem[],
  answers: Record<string, string | string[]>,
): string {
  const lines: string[] = ["User answered:"];
  for (const q of questions) {
    const raw = answers[q.question];
    const formatted = Array.isArray(raw)
      ? raw.join(", ")
      : typeof raw === "string" && raw.length > 0
        ? raw
        : "(no answer)";
    lines.push(`Q: ${q.question}`);
    lines.push(`A: ${formatted}`);
  }
  return lines.join("\n");
}

function formatDeclinedText(
  reason: string,
  partial: Record<string, string | string[]>,
): string {
  const partialNote =
    Object.keys(partial).length > 0
      ? ` Partial answers received: ${JSON.stringify(partial)}.`
      : "";
  return `User did not answer the questions (reason: ${reason}). Make a sensible default choice and continue, or ask again if the choice is genuinely required.${partialNote}`;
}

interface BuildOptions {
  cwd: string;
  /** Override timeout — primarily for tests. */
  timeoutMs?: number;
  /** Override poll interval — primarily for tests. */
  pollMs?: number;
}

/**
 * Build the AskUserQuestion ToolDefinition.
 *
 * The returned tool writes one approval file per call to
 * `<cwd>/.bunny-agent/approvals/<toolCallId>.json`, then waits up to
 * {@link ASK_USER_QUESTION_TIMEOUT_MS} for the host to update it. The tool
 * always cleans up its own approval file on exit.
 */
export function buildAskUserQuestionTool(opts: BuildOptions): ToolDefinition {
  const { cwd, timeoutMs, pollMs } = opts;
  return {
    name: TOOL_NAME,
    label: "AskUserQuestion",
    description: TOOL_DESCRIPTION,
    promptSnippet:
      "AskUserQuestion: ask the user 1-4 multiple-choice questions when the task is genuinely ambiguous.",
    promptGuidelines: [
      "Use AskUserQuestion only when the task is genuinely ambiguous and a user choice is required to proceed; otherwise pick a sensible default.",
      "Each question must carry 2-4 mutually exclusive options. Do not add an 'Other' option — the host adds one automatically.",
    ],
    // Pause other tool calls while a user prompt is open; otherwise pi may
    // surface output the user has not yet had a chance to react to.
    executionMode: "sequential",
    // biome-ignore lint/suspicious/noExplicitAny: TypeBox accepts plain JSON Schema literals here, see image-tools.ts.
    parameters: askUserQuestionSchema as any,
    async execute(toolCallId, params, signal) {
      const raw = (params as AskUserQuestionParams).questions ?? [];
      const sanitized = sanitizeQuestions(raw);
      const sanitizedInput: AskUserQuestionParams = { questions: sanitized };

      const approvalDir = join(cwd, APPROVAL_DIR);
      const approvalFile = join(approvalDir, `${toolCallId}.json`);

      try {
        mkdirSync(approvalDir, { recursive: true });
        const pending: ApprovalFile = {
          status: "pending",
          toolName: TOOL_NAME,
          input: sanitizedInput,
          questions: sanitized,
          answers: {},
        };
        writeFileSync(approvalFile, JSON.stringify(pending));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text" as const,
              text: `AskUserQuestion failed to create approval file: ${message}`,
            },
          ],
          details: undefined,
        };
      }

      let outcome: PollOutcome;
      try {
        outcome = await pollApprovalFile(approvalFile, signal, {
          timeoutMs,
          pollMs,
        });
      } finally {
        safeUnlink(approvalFile);
      }

      if (outcome.kind === "answered") {
        return {
          content: [
            {
              type: "text" as const,
              text: formatAcceptedText(sanitized, outcome.answers),
            },
          ],
          details: undefined,
        };
      }

      const reason =
        outcome.kind === "timeout"
          ? "timeout"
          : outcome.kind === "aborted"
            ? "run_aborted"
            : (outcome.reason ?? outcome.kind);
      return {
        content: [
          {
            type: "text" as const,
            text: formatDeclinedText(reason, outcome.answers),
          },
        ],
        details: undefined,
      };
    },
  };
}
