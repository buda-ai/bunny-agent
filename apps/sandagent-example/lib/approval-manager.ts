/**
 * Approval Manager
 *
 * Manages tool approval requests and coordinates between SSE streams and submit API.
 * Uses toolCallId as the unique identifier for each approval request.
 */

interface ApprovalRequest {
  questions: any[];
  answers: Record<string, any>;
  onAnswer: (question: string, answer: any) => void;
  onComplete: (answers: Record<string, any>) => void;
  onTimeout: () => void;
  timeoutId?: NodeJS.Timeout;
}

class ApprovalManagerClass {
  private requests = new Map<string, ApprovalRequest>();

  /**
   * Register a new approval request
   * @param toolCallId - Unique identifier from SDK
   * @param callbacks - Callback functions for events
   */
  register(
    toolCallId: string,
    callbacks: {
      questions: any[];
      onAnswer: (question: string, answer: any) => void;
      onComplete: (answers: Record<string, any>) => void;
      onTimeout: () => void;
    },
  ): void {
    this.requests.set(toolCallId, {
      questions: callbacks.questions,
      answers: {},
      onAnswer: callbacks.onAnswer,
      onComplete: callbacks.onComplete,
      onTimeout: callbacks.onTimeout,
    });
  }

  /**
   * Submit an answer for a single question
   * @param toolCallId - Unique identifier
   * @param question - Question text (used as key)
   * @param answer - User's answer
   */
  submitAnswer(toolCallId: string, question: string, answer: any): void {
    const request = this.requests.get(toolCallId);
    if (!request) {
      throw new Error(`Approval request ${toolCallId} not found`);
    }

    // Use question text as key
    request.answers[question] = answer;

    // Trigger partial update callback
    request.onAnswer(question, answer);

    // Check if all questions are answered
    const allAnswered = request.questions.every(
      (q) => request.answers[q.question] !== undefined,
    );

    if (allAnswered) {
      this.complete(toolCallId);
    }
  }

  /**
   * Complete an approval request
   * @param toolCallId - Unique identifier
   */
  complete(toolCallId: string): void {
    const request = this.requests.get(toolCallId);
    if (!request) {
      throw new Error(`Approval request ${toolCallId} not found`);
    }

    // Clear timeout
    if (request.timeoutId) {
      clearTimeout(request.timeoutId);
    }

    // Trigger complete callback
    request.onComplete(request.answers);

    // Cleanup
    this.requests.delete(toolCallId);
  }

  /**
   * Handle timeout for an approval request
   * @param toolCallId - Unique identifier
   */
  timeout(toolCallId: string): void {
    const request = this.requests.get(toolCallId);
    if (!request) return;

    // Trigger timeout callback
    request.onTimeout();

    // Cleanup
    this.requests.delete(toolCallId);
  }
}

export const ApprovalManager = new ApprovalManagerClass();
