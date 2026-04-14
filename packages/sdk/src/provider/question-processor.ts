import type { SandboxAdapter } from "@bunny-agent/manager";
import type { SubmitAnswerParams } from "./types";

/**
 * Options for submitAnswer
 */
export interface SubmitAnswerOptions {
  /**
   * Optional base path prefix for approval files
   * @default ".bunny-agent/approvals"
   */
  basePath?: string;
}

/**
 * Submit user's answer for an AskUserQuestion tool call.
 * Writes the answer file to `.bunny-agent/approvals/{toolCallId}.json` in the sandbox workdir.
 *
 * @example
 * ```typescript
 * import { submitAnswer } from "@bunny-agent/sdk";
 *
 * await submitAnswer(sandbox, {
 *   toolCallId: "tool-456",
 *   questions: [...],
 *   answers: { "Question 1": "Answer 1" },
 * });
 * ```
 */
export async function submitAnswer(
  sandbox: SandboxAdapter,
  params: SubmitAnswerParams,
  options?: SubmitAnswerOptions,
): Promise<void> {
  const { toolCallId, questions, answers } = params;
  const basePath = options?.basePath ?? ".bunny-agent/approvals";

  const allAnswered = questions.every(
    (q) => answers[q.question] !== undefined && answers[q.question] !== "",
  );

  const answerData = {
    questions,
    answers,
    status: allAnswered ? "completed" : "pending",
    timestamp: new Date().toISOString(),
  };

  const filename = `${toolCallId}.json`;
  const handle = sandbox.getHandle() ?? (await sandbox.attach());
  // Absolute path so remote sandboxes (Sandock) write to the same path the runner reads (/workspace/.bunny-agent/approvals).
  const workdir = handle.getWorkdir();
  const targetDir = workdir
    ? `${workdir.replace(/\/$/, "")}/${basePath}`
    : basePath;

  await handle.upload(
    [{ path: filename, content: JSON.stringify(answerData, null, 2) }],
    targetDir,
  );

  console.log(
    `[submitAnswer] Answer submitted: ${targetDir}/${filename} (status: ${answerData.status}, workdir: ${workdir ?? "(none)"})`,
  );
}
