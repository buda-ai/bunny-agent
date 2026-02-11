import type { DynamicToolUIPart, UIMessage } from "ai";

// Re-export ai types
export type { UIMessage, DynamicToolUIPart };

/**
 * Artifact data structure
 */
export interface ArtifactData {
  artifactId: string;
  content: string;
  mimeType: string;
}

// ============================================================================
// useSandAgentChat Types
// ============================================================================

/**
 * Options for useSandAgentChat hook
 */
export interface UseSandAgentChatOptions {
  /** API endpoint for chat (default: /api/ai) */
  apiEndpoint?: string;
  /** Additional body params to pass to API on each request */
  body?: Record<string, unknown>;
}

/**
 * Return type for useSandAgentChat hook
 */
export interface UseSandAgentChatReturn {
  /** All chat messages */
  messages: UIMessage[];
  /** Current chat status */
  status: "submitted" | "streaming" | "ready" | "error";
  /** Error if any */
  error: Error | undefined;
  /** Whether the chat is loading (streaming or submitted) */
  isLoading: boolean;
  /** Whether there's an error */
  hasError: boolean;
  /** Extracted artifacts from messages */
  artifacts: ArtifactData[];
  /** Currently selected artifact */
  selectedArtifact: ArtifactData | null;
  /** Set the selected artifact */
  setSelectedArtifact: (artifact: ArtifactData | null) => void;
  /** Send a message */
  sendMessage: (text: string) => void;
  /** Stop the current stream */
  stop: () => void;
  /** Handle form submit (for use with PromptInput) */
  handleSubmit: (message: { text: string }) => void;
}

// ============================================================================
// useAskUserQuestion Types
// ============================================================================

/**
 * Question option structure
 */
export interface QuestionOption {
  label: string;
  description?: string;
}

/**
 * Question structure for AskUserQuestion tool
 */
export interface Question {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
}

/**
 * AskUserQuestion input structure (from tool)
 */
export interface AskUserQuestionInput {
  questions: Question[];
}

/**
 * AskUserQuestion output structure (answers)
 */
export interface AskUserQuestionOutput {
  questions: Question[];
  answers: Record<string, string>;
}

/**
 * Options for useAskUserQuestion hook
 */
export interface UseAskUserQuestionOptions {
  /** The dynamic tool UI part from the message */
  part: DynamicToolUIPart;
  /** API endpoint for submitting answers (default: "/api/answer") */
  answerEndpoint?: string;
  /** Extra body params merged into the answer request (e.g. SANDBOX_PROVIDER, SANDOCK_API_KEY, template) */
  extraBody?: Record<string, unknown>;
  /** Callback when user selects an answer (called after API submission) */
  onAnswer?: (data: {
    toolCallId: string;
    questions: Question[];
    answers: Record<string, string>;
  }) => void;
}

/**
 * Return type for useAskUserQuestion hook
 */
export interface UseAskUserQuestionReturn {
  /** Parsed questions from the tool input */
  questions: Question[];
  /** Current selected answers (question -> value or values) */
  answers: Record<string, string | string[]>;
  /** Whether the tool interaction is completed */
  isCompleted: boolean;
  /** Whether waiting for user input (shows animation) */
  isWaitingForInput: boolean;
  /** Select an answer for a question */
  selectAnswer: (
    question: string,
    value: string,
    multiSelect?: boolean,
  ) => void;
  /** Get formatted answers map (for submission) */
  getAnswersMap: () => Record<string, string>;
  /** Check if an option is selected */
  isSelected: (
    question: string,
    optionLabel: string,
    multiSelect?: boolean,
  ) => boolean;
}

// ============================================================================
// useWriteTool Types
// ============================================================================

/**
 * Write tool input structure
 */
export interface WriteToolInput {
  file_path: string;
  content: string;
}

/**
 * Write tool output structure
 */
export interface WriteToolOutput {
  type: "create" | "edit";
  filePath: string;
  content: string;
  structuredPatch?: unknown[];
  originalFile?: string | null;
}

/**
 * Options for useWriteTool hook
 */
export interface UseWriteToolOptions {
  /** The dynamic tool UI part from the message */
  part: DynamicToolUIPart;
}

/**
 * Return type for useWriteTool hook
 */
export interface UseWriteToolReturn {
  /** File path being written to */
  filePath: string | null;
  /** File name (extracted from path) */
  fileName: string | null;
  /** File content */
  content: string | null;
  /** Operation type: 'create' or 'edit' */
  operationType: "create" | "edit" | null;
  /** Original file content (for edit operations) */
  originalContent: string | null;
  /** Structured patch data (for edit operations) */
  structuredPatch: unknown[] | null;
  /** Tool state */
  state: "streaming" | "input-available" | "output-available" | "error";
  /** Whether the tool is currently streaming input */
  isStreaming: boolean;
  /** Whether the write operation completed successfully */
  isCompleted: boolean;
  /** Whether there was an error */
  hasError: boolean;
  /** Error message if any */
  errorText: string | null;
  /** Whether this is a markdown file */
  isMarkdown: boolean;
  /** File extension */
  fileExtension: string | null;
}

// ============================================================================
// useArtifacts Types
// ============================================================================

/**
 * Options for useArtifacts hook
 */
export interface UseArtifactsOptions {
  /** Messages to extract artifacts from */
  messages: UIMessage[];
}

/**
 * Return type for useArtifacts hook
 */
export interface UseArtifactsReturn {
  /** All extracted artifacts */
  artifacts: ArtifactData[];
  /** Currently selected artifact */
  selectedArtifact: ArtifactData | null;
  /** Set the selected artifact */
  setSelectedArtifact: (artifact: ArtifactData | null) => void;
  /** Select artifact by ID */
  selectArtifactById: (artifactId: string) => void;
  /** Whether there are any artifacts */
  hasArtifacts: boolean;
  /** Number of artifacts */
  count: number;
  /** Copy artifact content to clipboard */
  copyContent: (artifact: ArtifactData) => Promise<void>;
  /** Download artifact as file */
  downloadArtifact: (artifact: ArtifactData) => void;
  /** Get file extension from mime type */
  getFileExtension: (mimeType: string) => string;
}
