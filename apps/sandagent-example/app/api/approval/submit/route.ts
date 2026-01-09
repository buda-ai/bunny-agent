import { ApprovalManager } from "@/lib/approval-manager";

/**
 * POST /api/approval/submit
 *
 * Submit a single answer for a tool approval request.
 *
 * Request body:
 * {
 *   toolCallId: string,
 *   question: string,  // Question text used as key
 *   answer: any
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   error?: string
 * }
 */
export async function POST(request: Request) {
  const { toolCallId, question, answer } = await request.json();

  try {
    ApprovalManager.submitAnswer(toolCallId, question, answer);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 },
    );
  }
}
