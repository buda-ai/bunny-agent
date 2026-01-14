/**
 * GAIA Benchmark Types
 *
 * Type definitions for GAIA benchmark tasks and results
 */

/**
 * GAIA task difficulty level
 */
export type GaiaLevel = 1 | 2 | 3;

/**
 * Task category based on capabilities required
 */
export type TaskCategory =
  | "files"
  | "code"
  | "search"
  | "browser"
  | "reasoning";

/**
 * Supported agent CLI runners
 */
export type AgentRunner =
  | "sandagent"
  | "gemini-cli"
  | "claudecode"
  | "codex-cli"
  | "opencode";

/**
 * File attachment for a GAIA task
 */
export interface GaiaFile {
  /** File name */
  name: string;
  /** Local file path */
  path: string;
  /** MIME type */
  type: string;
  /** Base64 data URL (optional, for small files) */
  data?: string;
}

/**
 * A single GAIA benchmark task
 */
export interface GaiaTask {
  /** Unique task identifier */
  id: string;
  /** The question/prompt for the agent */
  question: string;
  /** Difficulty level (1-3) */
  level: GaiaLevel;
  /** Expected answer */
  answer: string;
  /** File attachments (if any) */
  files?: GaiaFile[];
  /** Additional metadata from annotators */
  metadata?: Record<string, unknown>;
}

/**
 * Result of running a single benchmark task
 */
export interface BenchmarkResult {
  /** Task identifier */
  taskId: string;
  /** The question asked */
  question: string;
  /** Difficulty level */
  level: GaiaLevel;
  /** Files attached to the task */
  files?: string[];
  /** Agent's answer */
  answer: string;
  /** Expected answer */
  expectedAnswer: string;
  /** Whether the answer was correct */
  correct: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if task failed */
  error?: string;
  /** Raw output from the agent */
  rawOutput?: string;
}

/**
 * Configuration for a benchmark run
 */
export interface BenchmarkConfig {
  /** Dataset to use (validation or test) */
  dataset: "validation" | "test";
  /** Filter by difficulty level */
  level?: GaiaLevel;
  /** Filter by task category */
  category?: TaskCategory;
  /** Limit number of tasks */
  limit?: number;
  /** Run a random single task */
  random?: boolean;
  /** Run a specific task by ID */
  taskId?: string;
  /** Output directory for results */
  outputDir: string;
  /** Enable verbose output */
  verbose: boolean;
  /** Enable reflection during task execution */
  reflect?: boolean;
  /** Resume from last checkpoint */
  resume?: boolean;
}

/**
 * Configuration for a specific agent runner
 */
export interface RunnerConfig {
  /** Runner type */
  runner: AgentRunner;
  /** Command to execute (defaults to runner name) */
  command?: string;
  /** Additional command line arguments */
  args?: string[];
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Working directory */
  cwd?: string;
}

/**
 * Metadata for a complete benchmark run
 */
export interface BenchmarkMetadata {
  /** Dataset used */
  dataset: string;
  /** Timestamp of the run */
  timestamp: string;
  /** Total number of tasks */
  total: number;
  /** Number of correct answers */
  correct: number;
  /** Accuracy percentage */
  accuracy: number;
  /** Runner used */
  runner: AgentRunner;
  /** Additional runner info */
  runnerInfo?: string;
  /** Whether this was an incremental save */
  incremental?: boolean;
}

/**
 * Complete benchmark results file
 */
export interface BenchmarkReport {
  /** Metadata about the benchmark run */
  metadata: BenchmarkMetadata;
  /** Individual task results */
  results: BenchmarkResult[];
}

/**
 * Comparison results across multiple runners
 */
export interface ComparisonResult {
  /** Task identifier */
  taskId: string;
  /** Difficulty level */
  level: GaiaLevel;
  /** Results per runner */
  runners: {
    [runner in AgentRunner]?: {
      correct: boolean;
      durationMs: number;
      answer: string;
    };
  };
}

/**
 * Summary statistics for a comparison
 */
export interface ComparisonSummary {
  /** Timestamp of comparison */
  timestamp: string;
  /** Statistics per runner */
  runners: {
    [runner in AgentRunner]?: {
      total: number;
      correct: number;
      accuracy: number;
      avgDurationMs: number;
    };
  };
  /** Per-level statistics */
  byLevel: {
    [level in GaiaLevel]?: {
      [runner in AgentRunner]?: {
        total: number;
        correct: number;
        accuracy: number;
      };
    };
  };
}
