import {
  type AgentTurnInputV1,
  compileAgentTurnInput,
  createLegacyAgentTurnInput,
  parseAgentTurnInputV1,
} from "@bunny-agent/manager";
import {
  isSupportedSearchContractVersion,
  type SearchContractCapabilities,
} from "@bunny-agent/manager/contracts";
import type { BaseRunnerOptions } from "@bunny-agent/runner-claude";
import { createClaudeRunner } from "@bunny-agent/runner-claude";
import { createCodexRunner } from "@bunny-agent/runner-codex";
import { createCopilotRunner } from "@bunny-agent/runner-copilot";
import { createGeminiRunner } from "@bunny-agent/runner-gemini";
import { createOpenCodeRunner } from "@bunny-agent/runner-opencode";
import { createPiRunner, type PiRunnerOptions } from "@bunny-agent/runner-pi";
import { loadSystemPrompt } from "./prompt.js";
import { readSessionId, writeSessionId } from "./session.js";
import { discoverSkillPaths } from "./skills.js";

/**
 * Serializable custom tool ref shared by runners without coupling the harness
 * to either runner's nominal tool-ref type.
 */
export interface RunnerToolRef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  runtime:
    | { type: "http"; url: string; headers?: Record<string, string> }
    | { type: "module"; module: string; exportName?: string };
}

export interface RunnerCoreOptions extends BaseRunnerOptions {
  runner: string;
  /** Versioned structured input. Preferred over userInput when present. */
  input?: AgentTurnInputV1;
  /** Text-only compatibility input. */
  userInput?: string;
  skillPaths?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /**
   * Optional caller-declared subset of `env` that is safe to forward to the
   * bash tool's child process. Currently only the `pi` runner consumes this;
   * other runners ignore it. When omitted, pi-runner falls back to
   * whitelist-based classification of `env`.
   */
  systemEnv?: Record<string, string>;
  abortController?: AbortController;
  yolo?: boolean;
  /**
   * Whether to auto-inject CLAUDE.md/AGENTS.md as systemPrompt and
   * auto-read/write .bunny-agent/session-id for resume.
   * Default: true (good for TUI/runner-cli).
   * Set false for daemon/API usage where caller manages these explicitly.
   */
  autoInject?: boolean;
  /**
   * Tool refs to expose to the LLM as native runner tools. Claude consumes
   * them through an in-process MCP server and Pi uses native tool definitions.
   */
  toolRefs?: RunnerToolRef[];
  /**
   * Request-scoped MCP servers. Currently only the `pi` runner consumes this;
   * other runners ignore it.
   */
  mcpConfig?: PiRunnerOptions["mcpConfig"];
  /**
   * Reasoning effort / thinking level (e.g. "low", "medium", "high").
   * Consumed by Pi (thinking level), Codex (modelReasoningEffort), and Copilot
   * (reasoningEffort); other runners ignore it.
   */
  effort?: string;
  /**
   * Maximum time to wait for an interactive user answer before allowing the
   * supported runner to continue with a model-visible timeout result.
   */
  askUserQuestionTimeoutMs?: number;
  /**
   * Source session ID to fork from before running the current turn. When set,
   * the runner snapshot-clones the source session into a fresh session with a
   * new id and continues chat on top of that copied history. Mutually
   * exclusive with `resume`.
   *
   * Consumed by the `pi` runner (session file clone) and the `claude` runner
   * (SDK `forkSession`); other runners ignore it.
   */
  forkFrom?: string;
  /**
   * Explicit opt-in to the versioned web search / answer citation contract
   * (see `@bunny-agent/manager/contracts`). Absent means legacy text-only
   * search behavior. Only `pi` (structured retrieval + explicit citation
   * bridge) and `codex` (unavailable-detail envelope) currently support an
   * explicit v1 selection; other runners reject it rather than silently
   * ignoring the request.
   */
  searchContractVersion?: number;
}

/** Runners that accept an explicit `searchContractVersion` selection today. */
const SEARCH_CONTRACT_SUPPORTED_RUNNERS = new Set(["pi", "codex"]);

/**
 * Resolve the honest capability acknowledgement for a runner/version pair.
 * Only called after the version itself has already been validated as
 * supported by this release (see {@link isSupportedSearchContractVersion}).
 */
export function resolveSearchContractCapabilities(
  runner: string,
  version: 1,
): SearchContractCapabilities {
  if (runner === "pi") {
    return {
      version,
      structured_retrieval: true,
      // The installed Pi model adapter exposes text/text signatures with no
      // annotation field (see design.md §5) — this must stay false until an
      // upstream adapter release actually carries native annotations.
      native_annotations: false,
      explicit_source_marker_annotations: true,
    };
  }
  if (runner === "codex") {
    return {
      version,
      // Codex's web_search completion exposes only {query}; no result list
      // or citation metadata is ever recoverable from it.
      structured_retrieval: false,
      native_annotations: false,
      explicit_source_marker_annotations: false,
    };
  }
  throw new Error(
    `resolveSearchContractCapabilities: runner "${runner}" does not support an explicit search contract version`,
  );
}

/** Build the structured `message-metadata` acknowledgement SSE chunk. */
function searchContractAcknowledgementChunk(
  capabilities: SearchContractCapabilities,
): string {
  return (
    "data: " +
    JSON.stringify({
      type: "message-metadata",
      messageMetadata: {
        searchContract: capabilities,
      },
    }) +
    "\n\n"
  );
}

/** Build the SSE error+finish envelope used for a rejected request, matching `server-ai-sdk`'s errorEnvelope shape. */
function unsupportedSearchContractEnvelope(message: string): string {
  return (
    `data: ${JSON.stringify({ type: "error", errorText: message })}\n\n` +
    `data: ${JSON.stringify({ type: "finish", finishReason: "error" })}\n\n` +
    `data: [DONE]\n\n`
  );
}

export function createRunner(
  options: RunnerCoreOptions,
): AsyncIterable<string> {
  if (options.searchContractVersion !== undefined) {
    const rejection = rejectUnsupportedSearchContract(options);
    if (rejection) return rejection;
  }

  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? (process.env as Record<string, string>);
  const abortController = options.abortController ?? new AbortController();
  const autoInject = options.autoInject ?? true;

  // Auto-inject system prompt from CLAUDE.md / AGENTS.md if not provided
  const systemPrompt =
    options.systemPrompt ?? (autoInject ? loadSystemPrompt(cwd) : undefined);

  // Auto-resume session if not explicitly set
  const resume =
    options.resume ?? (autoInject ? readSessionId(cwd) : undefined);

  const base = {
    model: options.model,
    systemPrompt,
    maxTurns: options.maxTurns,
    allowedTools: options.allowedTools,
    resume,
    yolo: options.yolo,
    env,
    abortController,
    askUserQuestionTimeoutMs: options.askUserQuestionTimeoutMs,
  };

  const input = options.input
    ? parseAgentTurnInputV1(options.input)
    : createLegacyAgentTurnInput(options.userInput ?? "");
  const rawStream = dispatchRunner(options.runner, base, cwd, options, input);
  const stream =
    options.searchContractVersion !== undefined
      ? prependSearchContractAcknowledgement(
          rawStream,
          resolveSearchContractCapabilities(
            options.runner,
            options.searchContractVersion as 1,
          ),
        )
      : rawStream;
  return autoInject ? captureSessionId(stream, cwd) : stream;
}

/**
 * Validate an explicitly selected `searchContractVersion` against both this
 * release's supported versions and the target runner's declared support.
 * Returns a one-shot AsyncIterable yielding the SSE error+finish envelope
 * when the request must be rejected, or `undefined` when it is valid and
 * dispatch should proceed. Rejecting here (before any runner work starts)
 * ensures an unsupported selection is never silently treated as v1.
 */
function rejectUnsupportedSearchContract(
  options: RunnerCoreOptions,
): AsyncIterable<string> | undefined {
  const version = options.searchContractVersion;
  if (!isSupportedSearchContractVersion(version)) {
    return (async function* () {
      yield unsupportedSearchContractEnvelope(
        `Unsupported searchContractVersion: ${JSON.stringify(version)}. This release supports version 1.`,
      );
    })();
  }
  if (!SEARCH_CONTRACT_SUPPORTED_RUNNERS.has(options.runner)) {
    return (async function* () {
      yield unsupportedSearchContractEnvelope(
        `Runner "${options.runner}" does not support searchContractVersion 1.`,
      );
    })();
  }
  return undefined;
}

/** Prepend the capability acknowledgement chunk to a runner's raw SSE stream. */
async function* prependSearchContractAcknowledgement(
  stream: AsyncIterable<string>,
  capabilities: SearchContractCapabilities,
): AsyncIterable<string> {
  yield searchContractAcknowledgementChunk(capabilities);
  yield* stream;
}

function dispatchRunner(
  runner: string,
  base: BaseRunnerOptions & {
    env: Record<string, string>;
    abortController: AbortController;
    askUserQuestionTimeoutMs?: number;
  },
  cwd: string,
  options: RunnerCoreOptions,
  input: AgentTurnInputV1,
): AsyncIterable<string> {
  const _env = base.env;
  const compiled = compileAgentTurnInput(input);
  const hasStructuredInput = options.input !== undefined;
  switch (runner) {
    case "claude":
      return createClaudeRunner({
        ...base,
        cwd,
        forkFrom: options.forkFrom,
        skillPaths: options.skillPaths ?? discoverSkillPaths(cwd),
        toolRefs: options.toolRefs,
      }).run(hasStructuredInput ? input : compiled.text);
    case "codex": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { outputFormat: _of, ...codexBase } = base;
      const codexEfforts = ["minimal", "low", "medium", "high", "xhigh"];
      if (compiled.images.length > 0) {
        throw new Error("Runner codex does not support structured image input");
      }
      return createCodexRunner({
        ...codexBase,
        cwd,
        ...(options.effort && codexEfforts.includes(options.effort)
          ? {
              modelReasoningEffort:
                options.effort as import("@bunny-agent/runner-codex").CodexRunnerOptions["modelReasoningEffort"],
            }
          : {}),
        searchContractVersion: options.searchContractVersion as 1 | undefined,
      }).run(compiled.text);
    }
    case "gemini":
      if (compiled.images.length > 0) {
        throw new Error(
          "Runner gemini does not support structured image input",
        );
      }
      return createGeminiRunner({
        model: options.model,
        cwd,
        env: base.env,
        abortController: base.abortController,
        systemPrompt: base.systemPrompt,
        resume: base.resume,
        yolo: base.yolo,
      }).run(compiled.text);
    case "pi": {
      return createPiRunner({
        ...base,
        cwd,
        sessionId: base.resume,
        forkFrom: options.forkFrom,
        skillPaths: options.skillPaths ?? discoverSkillPaths(cwd),
        toolRefs: options.toolRefs,
        mcpConfig: options.mcpConfig,
        effort: options.effort,
        systemEnv: options.systemEnv,
        searchContractVersion: options.searchContractVersion as 1 | undefined,
      }).run(hasStructuredInput ? input : compiled.text);
    }
    case "opencode":
      if (compiled.images.length > 0) {
        throw new Error(
          "Runner opencode does not support structured image input",
        );
      }
      return createOpenCodeRunner({
        model: options.model,
        cwd,
        env: base.env,
        abortController: base.abortController,
        systemPrompt: base.systemPrompt,
        resume: base.resume,
        yolo: base.yolo,
      }).run(compiled.text);
    case "copilot": {
      const reasoningEfforts = ["low", "medium", "high", "xhigh"];
      if (compiled.images.length > 0) {
        throw new Error(
          "Runner copilot does not support structured image input",
        );
      }
      return createCopilotRunner({
        model: options.model,
        systemPrompt: base.systemPrompt,
        allowedTools: base.allowedTools,
        resume: base.resume,
        yolo: base.yolo,
        cwd,
        env: base.env,
        abortController: base.abortController,
        ...(options.effort && reasoningEfforts.includes(options.effort)
          ? {
              reasoningEffort:
                options.effort as import("@bunny-agent/runner-copilot").CopilotReasoningEffort,
            }
          : {}),
      }).run(compiled.text);
    }
    default:
      throw new Error(`Unknown runner: ${runner}`);
  }
}

/**
 * Pass-through that extracts sessionId from stream chunks and persists it.
 */
async function* captureSessionId(
  stream: AsyncIterable<string>,
  cwd: string,
): AsyncIterable<string> {
  for await (const chunk of stream) {
    if (chunk.includes('"sessionId"') || chunk.includes('"session_id"')) {
      try {
        const payload = chunk.replace(/^data:\s*/, "").trim();
        if (payload && payload !== "[DONE]") {
          const json = JSON.parse(payload);
          const sessionId =
            json?.messageMetadata?.sessionId ??
            json?.messageMetadata?.session_id ??
            json?.sessionId;
          if (sessionId && typeof sessionId === "string") {
            writeSessionId(cwd, sessionId);
          }
        }
      } catch (error) {
        console.debug("[captureSessionId] failed to parse chunk", error);
      }
    }
    yield chunk;
  }
}

export type { BaseRunnerOptions };
