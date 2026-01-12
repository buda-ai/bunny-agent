export interface AskUserQuestionOutput {
  /**
   * The questions that were asked
   */
  questions: Array<{
    question: string;
    header: string;
    options: Array<{
      label: string;
      description: string;
    }>;
    multiSelect: boolean;
  }>;
  /**
   * The answers provided by the user.
   * Maps question text to answer string.
   * Multi-select answers are comma-separated.
   */
  answers: Record<string, string>;
}

export type ChatAddToolOutputFunction = (output: {
  tool: string;
  toolCallId: string;
  output: AskUserQuestionOutput;
  approval?: {
    id: string;
    approved: true;
    reason?: string;
  };
}) => void;
