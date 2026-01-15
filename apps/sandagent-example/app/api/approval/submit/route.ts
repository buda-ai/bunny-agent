import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";

/**
 * POST /api/approval/submit
 *
 * Submit all collected answers for a tool approval request.
 *
 * Request body:
 * {
 *   sessionId: string,  // Sandbox session ID
 *   toolCallId: string,
 *   questions: Array<{ question: string }>,
 *   answers: Record<string, any>,  // All collected answers
 *   template?: string,           // Template name for sandbox naming
 *   E2B_API_KEY?: string,        // Client-provided E2B key
 *   SANDOCK_API_KEY?: string,    // Client-provided Sandock key
 *   SANDBOX_PROVIDER?: string    // 'e2b' or 'sandock'
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   error?: string
 * }
 */
export async function POST(request: Request) {
  const {
    sessionId,
    toolCallId,
    questions,
    answers,
    template = "default",
    E2B_API_KEY,
    SANDOCK_API_KEY,
    SANDBOX_PROVIDER = "e2b",
  } = await request.json();

  // Generate sandbox name to match ai/route.ts
  const sandboxName = `sandagent-${template}`;

  if (!sessionId || !toolCallId || !questions || !answers) {
    return Response.json(
      {
        success: false,
        error: "sessionId, toolCallId, questions, and answers are required",
      },
      { status: 400 },
    );
  }

  try {
    // Validate sandbox provider and API key
    if (SANDBOX_PROVIDER === "e2b" && !E2B_API_KEY) {
      return Response.json(
        {
          success: false,
          error: "E2B_API_KEY not configured",
        },
        { status: 500 },
      );
    }

    if (SANDBOX_PROVIDER === "sandock" && !SANDOCK_API_KEY) {
      return Response.json(
        {
          success: false,
          error: "SANDOCK_API_KEY not configured",
        },
        { status: 500 },
      );
    }

    // Create sandbox adapter based on provider
    // Note: We're only attaching to an existing sandbox, so templatesPath is not needed
    const sandbox =
      SANDBOX_PROVIDER === "sandock"
        ? new SandockSandbox({
            apiKey: SANDOCK_API_KEY,
          })
        : new E2BSandbox({
            apiKey: E2B_API_KEY,
            name: sandboxName,
          });

    const handle = await sandbox.attach(sessionId);

    // Ensure approval directory exists
    for await (const _chunk of handle.exec([
      "mkdir",
      "-p",
      "/sandagent/approvals",
    ])) {
      // consume chunks
    }

    // Check if all questions are answered
    const allAnswered = questions.every(
      (q: { question: string }) =>
        answers[q.question] !== undefined && answers[q.question] !== "",
    );

    // Create approval file with all answers
    const approval = {
      questions,
      answers,
      status: allAnswered ? "completed" : "pending",
    };

    // Write file directly - no need to read first
    const content = JSON.stringify(approval);
    await handle.upload(
      [{ path: `${toolCallId}.json`, content }],
      "/sandagent/approvals",
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to submit answer:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
