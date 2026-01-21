/**
 * Options for executing a command in the sandbox
 */
export interface ExecOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** AbortSignal for cancelling the operation */
  signal?: AbortSignal;
}

/**
 * Represents a handle to an active sandbox instance
 */
export interface SandboxHandle {
  /**
   * Execute a command in the sandbox and stream the output
   * @param command - The command and arguments to execute
   * @param opts - Execution options
   * @returns An async iterable of stdout chunks
   */
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array>;

  /**
   * Upload files to the sandbox
   * @param files - Array of files to upload
   * @param targetDir - Target directory in the sandbox
   */
  upload(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string,
  ): Promise<void>;

  /**
   * Destroy the sandbox and release resources
   */
  destroy(): Promise<void>;
}

/**
 * Adapter interface for sandbox implementations
 */
export interface SandboxAdapter {
  /**
   * Attach to or create a sandbox
   * @param id - Unique identifier for the sandbox instance
   * @returns A handle to the sandbox
   */
  attach(id: string): Promise<SandboxHandle>;

  /**
   * Get the environment variables configured for this sandbox.
   * These will be passed to all commands executed in the sandbox.
   */
  getEnv?(): Record<string, string>;

  /**
   * Get the agent template configured for this sandbox.
   * (e.g., "default", "coder", "analyst", "researcher")
   */
  getAgentTemplate?(): string;

  /**
   * Get the working directory configured for this sandbox.
   */
  getWorkdir?(): string;
}

/**
 * Output format types
 * - "text": Plain text output (final result only)
 * - "json": Single JSON result object
 * - "stream-json": Realtime streaming JSON (NDJSON)
 * - "stream": SSE-based AI SDK UI Data Stream format
 */
export type OutputFormat = "text" | "json" | "stream-json" | "stream";

/**
 * Specification for the agent runner
 */
export interface RunnerSpec {
  /** The type of runner to use */
  kind: "claude-agent-sdk";
  /** The model to use */
  model: string;
  /** Optional system prompt override (overrides template's CLAUDE.md) */
  systemPrompt?: string;
  /** Maximum number of conversation turns */
  maxTurns?: number;
  /** Allowed tools (undefined means all tools, or use template's settings) */
  allowedTools?: string[];
  /** Approval file directory for tool approval flow (e.g., "/sandagent/approvals") */
  approvalDir?: string;
  /** Output format for streaming responses */
  outputFormat?: OutputFormat;
}

/**
 * Options for creating a SandAgent instance
 */
export interface SandAgentOptions {
  /** Unique identifier for the sandbox instance */
  sandboxId: string;
  /** Sandbox adapter to use */
  sandbox: SandboxAdapter;
  /** Runner specification */
  runner: RunnerSpec;
  /** Environment variables to pass to the sandbox */
  env?: Record<string, string>;
}

/**
 * A message in the conversation
 */
export interface Message {
  /** Role of the message sender */
  role: "user" | "assistant" | "system";
  /** Content of the message */
  content: string;
}

/**
 * Input for streaming a task
 */
export interface StreamInput {
  /** Messages to send to the agent */
  messages: Message[];
  /** Workspace configuration */
  workspace?: {
    /** Path to the workspace directory */
    path?: string;
  };
  /** Content type for the response (defaults to text/event-stream) */
  contentType?: string;
  /** Transcript writer for recording all streamed data (optional) */
  transcriptWriter?: TranscriptWriter;
  /** Runner session ID to resume a previous conversation (from assistant message metadata) */
  resume?: string;
  /** AbortSignal for cancelling the operation */
  signal?: AbortSignal;
}

/**
 * A single transcript entry
 */
export interface TranscriptEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Type of entry */
  type: "chunk" | "metadata" | "error" | "start" | "end";
  /** Raw data (base64 encoded for binary) */
  data?: string;
  /** Decoded text (if data is text) */
  text?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for writing transcript entries
 */
export interface TranscriptWriter {
  /**
   * Write a transcript entry
   * @param entry - The entry to write
   */
  write(entry: TranscriptEntry): void | Promise<void>;

  /**
   * Close the writer and flush any pending data
   */
  close?(): void | Promise<void>;
}
