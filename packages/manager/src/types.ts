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

/**
 * JSON Schema (Draft-07 subset) describing a remote tool's input parameters.
 * Forwarded to the runner as a tool definition, then to the LLM as part of the tool spec.
 */
export type RemoteToolSchema = Record<string, unknown>;

/**
 * Wire-format description of a remote tool — what the runner needs to know to
 * register the tool with the LLM. Carries no executor; the host keeps that.
 *
 * This is an internal/serialization type. Application code should use
 * {@link RemoteTool} (which carries `execute`) and let the SDK strip the spec
 * out before sending it across the wire.
 */
export interface RemoteToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool input. Currently object schemas are expected. */
  inputSchema: RemoteToolSchema;
}

/**
 * Per-invocation context passed to a {@link RemoteTool.execute}.
 *
 * Stable v1 shape — extending it later is a breaking change, so it's better to
 * carry the fields callers will plausibly need (abort, session correlation)
 * from day one.
 */
export interface ToolExecutorContext {
  /**
   * Aborted when the originating stream is aborted. Long-running executors
   * (network calls, child processes) should respect this.
   */
  signal: AbortSignal;
  /** Session id of the originating stream, if known. */
  sessionId?: string;
}

/**
 * Public-facing remote tool definition. Applications declare these once and
 * pass them to the BunnyAgent provider; the SDK takes care of routing calls
 * from the in-sandbox runner back to `execute` via whichever transport the
 * sandbox supports.
 *
 * `execute` always runs in the host process, never inside the sandbox.
 */
export interface RemoteTool extends RemoteToolSpec {
  execute(input: unknown, ctx: ToolExecutorContext): Promise<unknown>;
}

/**
 * Internal dispatcher signature. Bridge implementations (unix socket server,
 * HTTP route, ...) receive an invocation by tool name + raw input and forward
 * to the appropriate {@link RemoteTool.execute}.
 *
 * Not part of the public surface — applications work with {@link RemoteTool}.
 */
export type RemoteToolExecutor = (
  name: string,
  input: unknown,
  ctx: ToolExecutorContext,
) => Promise<unknown>;

/**
 * Transport descriptor used by the runner to dispatch remote tool invocations
 * back to the caller. Two flavors:
 *
 * - `http`: the runner POSTs `{ name, input }` to `url` with a Bearer `token`.
 *   Required for any cross-host configuration (remote sandboxes; daemon mode).
 * - `unix`: the runner connects to a local Unix domain socket and exchanges
 *   line-delimited JSON. Only viable when the runner shares a filesystem with
 *   the caller (e.g. `LocalSandbox`); auth comes from the per-session 0700
 *   directory containing the socket.
 *
 * Tokens never appear on the unix variant — there is nothing to leak.
 */
export type ToolBridge =
  | {
      transport: "http";
      /** Absolute URL the runner POSTs to when invoking a remote tool. */
      url: string;
      /** Bearer token sent in the Authorization header on every callback request. */
      token: string;
    }
  | {
      transport: "unix";
      /** Absolute path to a Unix domain socket served by the caller. */
      socketPath: string;
    };

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
   * Remote tools the runner should expose to the LLM. The daemon wraps these as
   * runner-native tools whose `execute` proxies to {@link toolBridge}.
   * Must be paired with `toolBridge`; one without the other is a configuration error.
   */
  tools?: RemoteToolSpec[];
  /** HTTP callback bridge for dispatching remote tool invocations to the caller. */
  toolBridge?: ToolBridge;
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

  /**
   * Optional. Create a sandbox-native callback channel the in-sandbox runner
   * can use to invoke {@link RemoteTool}s defined in the host process.
   *
   * Implementations stand up whatever transport fits the sandbox's locality:
   * `LocalSandbox` opens a Unix domain socket on a 0700 per-session directory;
   * remote sandboxes that support reverse port-forwarding may instead start
   * an HTTP server bound to a host-local port and arrange for the sandbox to
   * reach it. Sandboxes that have no way to reach back should leave this
   * unimplemented — the SDK will surface a clear error to the caller.
   *
   * The returned {@link ToolBridge} descriptor is opaque to the sandbox; the
   * SDK forwards it through `BunnyAgentCodingRunBody.toolBridge` (daemon mode)
   * or the runner-cli env (CLI mode) so the runner can wire it into pi-runner
   * `customTools`.
   *
   * `close()` must be idempotent and tear down the transport (server +
   * filesystem artifacts). Long-running tool calls in flight at the moment of
   * close should be allowed to drain — never killed mid-flight.
   */
  createToolBridge?(input: {
    tools: RemoteTool[];
    sessionId?: string;
  }): Promise<{
    bridge: ToolBridge;
    close(): Promise<void>;
  }>;
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
   * Remote tools the runner should expose to the LLM. Only consumed by runners
   * that wire {@link RemoteToolSpec} into their tool registry (currently `pi`).
   * Must be paired with {@link toolBridge}.
   */
  tools?: RemoteToolSpec[];
  /** Transport the runner uses to dispatch invocations of {@link tools}. */
  toolBridge?: ToolBridge;
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
