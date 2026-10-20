import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type {
  BunnyAgentOptions,
  McpConfig,
  SandboxAdapter,
  ToolRef,
} from "@bunny-agent/manager";

export type {
  McpConfig,
  McpHttpServerConfig,
  McpLifecycle,
  McpServerConfig,
  McpServerOptions,
  McpSettings,
  McpStdioServerConfig,
  ToolRuntime,
} from "@bunny-agent/manager";

/**
 * Artifact Processor result
 */
export interface ArtifactResult {
  artifactId: string;
  content: string;
  mimeType?: string;
}

/**
 * Stream writer interface for writing data parts
 */
export interface StreamWriter {
  write(chunk: {
    type: string;
    id?: string;
    data?: unknown;
    transient?: boolean;
  }): void;
}

/**
 * Context compaction progress reported by a runner.
 *
 * Runners whose agent SDK compacts the conversation automatically when the
 * context window fills (claude, copilot) emit a `start` event when compaction
 * begins and an `end` event when it finishes. Use it to render a transient
 * "Compacting…" indicator.
 */
export interface CompactionEvent {
  phase: "start" | "end";
  /** Only on `end`: whether compaction succeeded. */
  success?: boolean;
  /** What triggered it, when the runner reports it (e.g. "auto", "manual"). */
  trigger?: string;
  /** Context tokens before compaction. */
  preTokens?: number;
  /** Context tokens after compaction. */
  postTokens?: number;
  /** Failure detail, when compaction failed. */
  error?: string;
}

/**
 * Artifact Processor interface
 */
export interface ArtifactProcessor {
  /**
   * Invoked when a stream part is received
   * @param event - Stream part event
   * @param sessionId - Current session ID (taskId)
   */
  onChange(event: LanguageModelV3StreamPart, sessionId: string): Promise<void>;
}

/**
 * Question structure for AskUserQuestion tool
 */
export interface Question {
  question: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

/**
 * Parameters for submitting an answer
 */
export interface SubmitAnswerParams {
  /** Tool call ID from the AskUserQuestion tool */
  toolCallId: string;
  /** Original questions from the tool */
  questions: Question[];
  /** User's answers keyed by question text */
  answers: Record<string, string>;
}

/**
 * Logger interface for custom logging.
 */
export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * CLI runner type passed to `bunny-agent run --runner <runnerType>`.
 */
export type BunnyAgentRunnerType =
  | "claude"
  | "pi"
  | "codex"
  | "gemini"
  | "opencode";

/**
 * AI Provider specific settings that extend BunnyAgentOptions.
 * Requires a `sandbox`. Optional `daemonUrl` streams via bunny-agent-daemon HTTP
 * (`POST /api/coding/run`) inside the sandbox. Unless search contract `"auto"`
 * is selected, the SDK does not probe `/healthz` — call `isBunnyAgentDaemonHealthy` (re-exported from
 * `@bunny-agent/sdk`) when you want to check readiness and omit `daemonUrl` to fall
 * back to the CLI runner, or set `daemonUrl` and handle HTTP errors yourself.
 */
export interface BunnyAgentProviderSettings
  extends Omit<BunnyAgentOptions, "runner" | "sandboxId" | "sandbox"> {
  /** Required. All transports run relative to this adapter. */
  sandbox: SandboxAdapter;
  /**
   * bunny-agent-daemon base URL **inside** the sandbox (e.g. BunnyAgent image:
   * `http://127.0.0.1:3080`). When set, the SDK uses HTTP streaming only (no
   * automatic health probe or CLI fallback, except read-only capability discovery
   * when `searchContractVersion: "auto"` is selected).
   */
  daemonUrl?: string;
  /**
   * Which runner implementation to use: claude (default), pi, codex, gemini, opencode.
   * Maps to `bunny-agent run --runner <runnerType>`.
   */
  runnerType?: BunnyAgentRunnerType;
  /** Working directory for CLI operations inside the sandbox. */
  cwd?: string;
  /** Resume session ID for multi-turn conversation. */
  resume?: string;
  /**
   * Source pi session id to fork from before running the current turn. When
   * set, the runner snapshot-clones the source session into a fresh session
   * (new id, header.parentSession = source) and continues chat on top of the
   * copied history. Mutually exclusive with `resume`.
   *
   * Currently only the `pi` runner consumes this; other runners ignore it.
   */
  forkFrom?: string;
  /** Enable verbose logging for debugging. */
  verbose?: boolean;
  /** Custom logger for handling warnings and errors. */
  logger?: Logger | false;
  /** Artifact processors for handling artifact events. */
  artifactProcessors?: ArtifactProcessor[];
  /**
   * Called when the runner reports context compaction progress. The AI SDK
   * stream protocol has no part type for this, so it is delivered out-of-band;
   * a UI typically forwards it as a transient data part.
   */
  onCompaction?: (event: CompactionEvent) => void;
  /** Limit the number of back-and-forth iterations */
  maxTurns?: number;
  /** Optional system prompt override (overrides template's default) */
  systemPrompt?: string;
  /** Additional skill paths (files or directories) for pi runner */
  skillPaths?: string[];
  /** Allowed tools for the runner (undefined = template defaults). */
  allowedTools?: string[];
  /**
   * Skip tool approval checks (bypass permissions).
   * Defaults to true for Pi when used through the hosted SDK transport.
   * Set false only when the host implements the approval-file workflow.
   */
  yolo?: boolean;
  /** Advanced static tool refs to expose directly to the runner. */
  toolRefs?: ToolRef[];
  /**
   * Request-scoped MCP servers for the Pi runner. Trusted SDK callers may use
   * HTTP(S) or stdio servers inside the selected sandbox.
   */
  mcpConfig?: McpConfig;
  /** Reasoning effort / thinking level (e.g. "low", "medium", "high"). */
  effort?: string;
  /**
   * Explicit opt-in to the versioned web search / answer citation contract
   * (see `@bunny-agent/manager/contracts`, re-exported browser-safe as
   * `@bunny-agent/sdk/contracts`). Absent means legacy text-only search
   * behavior, unchanged; `1` requests the structured retrieval envelope and
   * Responses-shaped answer annotations. V1 requires a stable AI SDK 6 peer
   * at >=6.0.264 <7.0.0 to preserve tool-result metadata; older peers are
   * rejected before execution. Request-scoped, never a
   * process-global switch. The SDK rejects the call (surfaced as a stream
   * error / rejected `generateText`/`streamText` result) if the runner/daemon
   * never acknowledges support for the requested version rather than
   * silently falling back to legacy behavior or retrying automatically.
   * `"auto"` discovers a Pi daemon's capabilities before coding execution and
   * selects v1 only when advertised. An older healthy daemon without that
   * advertisement uses legacy behavior. Other runners and CLI-only transports
   * stay legacy in auto mode. Discovery failures reject instead of executing or
   * downgrading. Successful discovery is cached per handle/sandbox ID/URL for
   * 30 seconds; an in-place daemon restart can take that long to be rediscovered.
   */
  searchContractVersion?: 1 | "auto";
  /**
   * Optional subset of `env` whose keys are safe to expose to the pi runner's
   * bash tool. When omitted, the runner classifies `env` via a built-in
   * whitelist so business credentials never leak into the shell. Use this to
   * opt specific business keys back into bash when a workflow requires it.
   *
   * Ignored by runners other than `pi`.
   */
  systemEnv?: Record<string, string>;
}

/**
 * Model identifier: user passes whatever the runner expects (e.g. Claude model id, Pi model id).
 */
export type BunnyAgentModelId = string;
