import path from "node:path";
import { LocalSandbox, type Question, submitAnswer } from "@sandagent/sdk";

/**
 * POST /api/answer
 *
 * Receives user answers for AskUserQuestion tool calls.
 * Writes the answer file to the sandbox workdir so the runner can pick it up.
 *
 * Request body: { toolCallId: string, questions: Question[], answers: Record<string, string> }
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { toolCallId, questions, answers } = body as {
    toolCallId?: string;
    questions?: Question[];
    answers?: Record<string, string>;
  };

  if (!toolCallId || !questions || !answers) {
    return Response.json(
      {
        success: false,
        error: "Missing required parameters (toolCallId, questions, answers)",
      },
      { status: 400 },
    );
  }

  try {
    const sandbox = new LocalSandbox({
      workdir: path.join(process.cwd(), "workspace"),
    });

    await submitAnswer(sandbox, {
      toolCallId,
      questions,
      answers,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[API /api/answer] Failed to submit answer:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
