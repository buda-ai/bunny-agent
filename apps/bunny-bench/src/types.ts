export interface Task {
  id: string;
  name: string;
  prompt: string;
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
}
