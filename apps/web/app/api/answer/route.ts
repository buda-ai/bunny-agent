import { type Question, submitAnswer } from "@bunny-agent/sdk";
import {
  type CreateSandboxParams,
  getOrCreateSandbox,
} from "@/lib/example/create-sandbox";

/**
 * POST /api/answer
 *
 * Receives user answers for AskUserQuestion tool calls.
 * Creates a sandbox to write the approval file for the runner to read.
 *
 * Request body:
 *   toolCallId: string
 *   questions: Question[]
 *   answers: Record<string, string>
 *   SANDBOX_PROVIDER?: string
 *   E2B_API_KEY?: string
 *   SANDOCK_API_KEY?: string
 *   DAYTONA_API_KEY?: string
 *   ANTHROPIC_API_KEY?: string
 *   template?: string
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

  const b = body as Record<string, unknown>;
  const { toolCallId, questions, answers } = b;

  if (!toolCallId || !questions || !answers) {
    return Response.json(
      {
        success: false,
        error: "Missing required parameters (toolCallId, questions, answers)",
      },
      { status: 400 },
    );
  }

  const sandboxParams: CreateSandboxParams = {
    SANDBOX_PROVIDER: b.SANDBOX_PROVIDER as string | undefined,
    E2B_API_KEY: b.E2B_API_KEY as string | undefined,
    SANDOCK_API_KEY: b.SANDOCK_API_KEY as string | undefined,
    DAYTONA_API_KEY: b.DAYTONA_API_KEY as string | undefined,
    ANTHROPIC_API_KEY: b.ANTHROPIC_API_KEY as string | undefined,
    template: (b.template as string) ?? "default",
  };

  try {
    const sandbox = await getOrCreateSandbox(sandboxParams);
    await submitAnswer(sandbox, {
      toolCallId: toolCallId as string,
      questions: questions as Question[],
      answers: answers as Record<string, string>,
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
