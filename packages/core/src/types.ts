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
  exec(
    command: string[],
    opts?: ExecOptions
  ): AsyncIterable<Uint8Array>;

  /**
   * Upload files to the sandbox
   * @param files - Array of files to upload
   * @param targetDir - Target directory in the sandbox
   */
  upload(
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string
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
   * Attach to or create a sandbox with the given ID
   * @param id - Unique identifier for the sandbox
   * @returns A handle to the sandbox
   */
  attach(id: string): Promise<SandboxHandle>;
}

/**
 * Specification for the agent runner
 */
export interface RunnerSpec {
  /** The type of runner to use */
  kind: "claude-agent-sdk";
  /** The model to use */
  model: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Maximum number of conversation turns */
  maxTurns?: number;
  /** Allowed tools (undefined means all tools) */
  allowedTools?: string[];
}

/**
 * Options for creating a SandAgent instance
 */
export interface SandAgentOptions {
  /** Unique identifier for the agent (determines sandbox + volume) */
  id: string;
  /** Sandbox adapter to use */
  sandbox: SandboxAdapter;
  /** Runner specification */
  runner: RunnerSpec;
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
}
