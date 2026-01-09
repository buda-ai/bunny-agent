import { ApprovalManager } from "@/lib/approval-manager";

/**
 * POST /api/approval/sse
 *
 * SSE endpoint for tool approval flow.
 * Returns a Server-Sent Events stream that pushes partial answer updates.
 *
 * Request body:
 * {
 *   toolCallId: string,
 *   questions: Array<{ question: string, header?: string, options?: any[], multiSelect?: boolean }>
 * }
 *
 * SSE events:
 * - { type: 'answer', question: string, answer: any } - Partial update when user answers one question
 * - { type: 'complete', answers: Record<string, any> } - All questions answered
 * - { type: 'timeout' } - 60 second timeout reached
 */
export async function POST(request: Request) {
  const { toolCallId, questions } = await request.json();

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Register with Approval Manager
      ApprovalManager.register(toolCallId, {
        questions,
        onAnswer: (question, answer) => {
          // User answered one question, push partial update
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "answer",
              question,
              answer,
            })}\n\n`,
          );
        },
        onComplete: (answers) => {
          // All questions answered
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "complete",
              answers,
            })}\n\n`,
          );
          controller.close();
        },
        onTimeout: () => {
          // 60 second timeout
          controller.enqueue(
            `data: ${JSON.stringify({
              type: "timeout",
            })}\n\n`,
          );
          controller.close();
        },
      });

      // Set 60 second timeout
      setTimeout(() => {
        ApprovalManager.timeout(toolCallId);
      }, 60000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
