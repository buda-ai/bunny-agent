/**
 * Volume info (for backends that support persistent volumes)
 */
export interface Volume {
  volumeId: string;
  /** Space ID from the backend (e.g. Sandock space id when volume is tied to a space) */
  spaceId?: string;
  mountPath: string;
  /** Optional display name (e.g. volume name from config) */
  name?: string;
}

/**
 * Options for executing a command in the sandbox
 */
export interface ExecOptions {
  /** Working directory for the command */
  cwd?: string;
  /**
   * Environment variables for normal `exec` (merged into the subprocess env).
   * Not used by {@link streamCodingRunFromSandbox} — put runner vars in
   * {@link BunnyAgentCodingRunBody.env} instead.
   */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** AbortSignal for cancelling the operation */
  signal?: AbortSignal;
}

/** JSON Schema (Draft-07 subset) describing a tool's input parameters. */
export type ToolInputSchema = Record<string, unknown>;

/** Runtime descriptor for a tool the sandbox runner can execute by POSTing directly to an HTTP endpoint. */
export interface HttpToolRuntime {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

/** Runtime descriptor for a tool implemented by a module that already exists inside the sandbox. */
export interface ModuleToolRuntime {
  type: "module";
  module: string;
  exportName?: string;
}

export type ToolRuntime = HttpToolRuntime | ModuleToolRuntime;

/**
 * Runner wire-format tool. Public user APIs compile into this serializable
 * shape before the request crosses into runner-cli or bunny-agent-daemon.
 */
export interface ToolRef {
  name: string;
  description: string;
  /** JSON Schema for the tool input. Currently object schemas are expected. */
  inputSchema: ToolInputSchema;
  runtime: ToolRuntime;
}

/**
 * JSON body for bunny-agent-daemon `POST /api/coding/run` (same shape as apps/daemon).
 */
export interface BunnyAgentCodingRunBody {
  runner?: string;
  model?: string;
  userInput: string;
  systemPrompt?: string;
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  skillPaths?: string[];
  cwd?: string;
  /**
   * Extra env vars merged into the runner subprocess env (after daemon `process.env`).
   * String keys and string values only; invalid entries are dropped by the daemon.
   */
  env?: Record<string, string>;
  /** Skip tool approval checks (bypass permissions). */
  yolo?: boolean;
  /**
   * Runtime tools the runner should expose to the LLM. Each tool carries both
   * its LLM-facing spec and the runtime the in-sandbox runner should use when
   * the model calls it.
   */
  toolRefs?: ToolRef[];
}

/**
 * Represents a handle to an active sandbox instance
 */
export interface SandboxHandle {
  /**
   * Get the sandbox instance ID (available after attach).
   * Returns null for local sandboxes that don't have a remote ID.
   */
  getSandboxId(): string | null;

  /**
   * Get the volume mounts for this sandbox (available after attach).
   * Returns null for sandboxes that don't support volumes.
   */
  getVolumes(): Volume[] | null;

  /**
   * Get the working directory for this sandbox handle
   * @returns The working directory path
   */
  getWorkdir(): string;

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
   * Read a file from the sandbox
   * @param filePath - Path to the file in the sandbox
   * @returns The file content as a string
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Optional fast path for daemon coding runs.
   * When implemented (e.g. Sandock), callers can stream coding-run output
   * without uploading request JSON into sandbox temp files.
   */
  streamCodingRun?(
    body: BunnyAgentCodingRunBody,
    opts?: ExecOptions,
  ): AsyncIterable<Uint8Array>;

  /**
   * Destroy the sandbox and release resources
   */
  destroy(): Promise<void>;
}

/**
 * Question for AskUserQuestion tool
 */
export interface Question {
  question: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

/**
 * Adapter interface for sandbox implementations
 */
export interface SandboxAdapter {
  /**
   * Attach to or create a sandbox
   * @returns A handle to the sandbox
   */
  attach(): Promise<SandboxHandle>;

  /**
   * Get the current handle if already attached, or null if not attached yet.
   * @returns A handle to the sandbox if already attached, null otherwise
   */
  getHandle(): SandboxHandle | null;

  /**
   * Get the environment variables configured for this sandbox.
   * These will be passed to all commands executed in the sandbox.
   */
  getEnv?(): Record<string, string>;

  /**
   * Get the working directory configured for this sandbox.
   */
  getWorkdir?(): string;

  /**
   * Get the runner command to execute in the sandbox.
   * Returns the command array (e.g., ["bunny-agent", "run"] or ["node", "/path/to/bundle.mjs", "run"])
   */
  getRunnerCommand?(): string[];

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
  /** The model to use */
  model: string;
  /**
   * CLI runner type: which implementation to use when running `bunny-agent run`
   * (e.g. claude, pi, codex, gemini, opencode). Default is "claude".
   */
  runnerType?: "claude" | "pi" | "codex" | "gemini" | "opencode";
  /** Optional system prompt override (overrides template's CLAUDE.md) */
  systemPrompt?: string;
  /** Maximum number of conversation turns */
  maxTurns?: number;
  /** Allowed tools (undefined means all tools, or use template's settings) */
  allowedTools?: string[];
  /** Output format for streaming responses */
  outputFormat?: OutputFormat;
  /** Additional skill paths (files or directories) for pi runner */
  skillPaths?: string[];
  /**
   * When true, skip all tool approval checks (bypass permissions).
   * When false (default), runner pauses before executing any tool and waits for approval
   * via the .bunny-agent/approvals/{toolUseID}.json file mechanism.
   */
  yolo?: boolean;
}

/**
 * Options for creating a BunnyAgent instance
 */
export interface BunnyAgentOptions {
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
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image"; data: string; mimeType: string }
      >;
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
  /**
   * Tool refs the runner should expose to the LLM. Only consumed by runners
   * that wire {@link ToolRef} into their tool registry (currently `pi`).
   */
  toolRefs?: ToolRef[];
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
