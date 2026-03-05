/**
 * SandAgent Runner Types
 * 
 * Runners that test sandagent CLI with different --runner options
 */

export type SandAgentRunner = "claude" | "pi" | "codex" | "copilot";

/**
 * Task for smoking benchmark
 */
export interface SmokingTask {
  id: string;
  name: string;
  description: string;
  expectedOutput: string | RegExp;
  category: "file" | "code" | "bash" | "reasoning";
  timeoutMs: number;
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  taskId: string;
  success: boolean;
  answer?: string;
  expectedAnswer?: string | RegExp;
  rawOutput?: string | object | unknown[];
  error?: string;
  durationMs: number;
}

/**
 * GAIA task (minimal for compatibility)
 */
export interface GaiaTask {
  task_id: string;
  Question: string;
  Level: number;
  "Final answer": string;
}
