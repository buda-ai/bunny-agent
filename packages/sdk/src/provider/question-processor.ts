import type { SandboxAdapter } from "@sandagent/manager";
import type { SubmitAnswerParams } from "./types";

/**
 * Options for submitAnswer
 */
export interface SubmitAnswerOptions {
  /**
   * Optional base path prefix for approval files
   * @default ".sandagent/approvals"
   */
  basePath?: string;
}

/**
 * Submit user's answer for an AskUserQuestion tool call.
 * Writes the answer file to `.sandagent/approvals/{toolCallId}.json` in the sandbox workdir.
 *
 * @example
 * ```typescript
 * import { submitAnswer } from "@sandagent/sdk";
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
  const basePath = options?.basePath ?? ".sandagent/approvals";

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
  await handle.upload(
    [{ path: filename, content: JSON.stringify(answerData, null, 2) }],
    basePath,
  );

  console.log(
    `[submitAnswer] Answer submitted: ${basePath}/${filename} (status: ${answerData.status})`,
  );
}
