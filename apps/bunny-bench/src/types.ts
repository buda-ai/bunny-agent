export interface Task {
  id: string;
  name: string;
  prompt: string;
  /** Human-readable question text (for error reports). Falls back to prompt if not set. */
  question?: string;
  /** Raw expected answer string (for error reports). */
  expectedAnswer?: string;
  /** string = exact match (case-insensitive), RegExp = pattern match */
  expected: string | RegExp;
  category: "reasoning" | "tool:web" | "tool:code" | "tool:file";
  timeoutMs: number;
}

export interface TaskResult {
  task: Task;
  output: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface FailedDetail {
  id: string;
  question: string;
  expectedAnswer: string;
  got: string;
  error?: string;
  durationMs: number;
}

export interface RunSummary {
  runner: string;
  model: string | undefined;
  dataset: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  durationMs: number;
  results: TaskResult[];
  failedDetails?: FailedDetail[];
}
