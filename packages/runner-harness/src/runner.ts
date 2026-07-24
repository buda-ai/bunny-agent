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

export interface RunnerCoreOptions extends BaseRunnerOptions {
  runner: string;
  userInput: string;
  /** Full transcript used only when the requested Pi session is missing. */
  resumeFallbackUserInput?: string;
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
   * Tool refs to expose to the LLM as native runner tools. Currently only
   * the `pi` runner consumes these; other runners ignore the field.
   */
  toolRefs?: PiRunnerOptions["toolRefs"];
  /**
   * Reasoning effort / thinking level (e.g. "low", "medium", "high").
   * Consumed by the `pi` runner (thinking level) and the `codex` runner
   * (modelReasoningEffort); other runners ignore it.
   */
  effort?: string;
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
}

export function createRunner(
  options: RunnerCoreOptions,
): AsyncIterable<string> {
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
  };

  const rawStream = dispatchRunner(options.runner, base, cwd, options);
  return autoInject ? captureSessionId(rawStream, cwd) : rawStream;
}

function dispatchRunner(
  runner: string,
  base: BaseRunnerOptions & {
    env: Record<string, string>;
    abortController: AbortController;
  },
  cwd: string,
  options: RunnerCoreOptions,
): AsyncIterable<string> {
  const _env = base.env;
  switch (runner) {
    case "claude":
      return createClaudeRunner({
        ...base,
        cwd,
        forkFrom: options.forkFrom,
      }).run(options.userInput);
    case "codex": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { outputFormat: _of, ...codexBase } = base;
      const codexEfforts = ["minimal", "low", "medium", "high", "xhigh"];
      return createCodexRunner({
        ...codexBase,
        cwd,
        ...(options.effort && codexEfforts.includes(options.effort)
          ? {
              modelReasoningEffort:
                options.effort as import("@bunny-agent/runner-codex").CodexRunnerOptions["modelReasoningEffort"],
            }
          : {}),
      }).run(options.userInput);
    }
    case "gemini":
      return createGeminiRunner({
        model: options.model,
        cwd,
        env: base.env,
        abortController: base.abortController,
        systemPrompt: base.systemPrompt,
        yolo: base.yolo,
      }).run(options.userInput);
    case "pi": {
      return createPiRunner({
        ...base,
        cwd,
        sessionId: base.resume,
        resumeFallbackUserInput: options.resumeFallbackUserInput,
        forkFrom: options.forkFrom,
        skillPaths: options.skillPaths ?? discoverSkillPaths(cwd),
        toolRefs: options.toolRefs,
        effort: options.effort,
        systemEnv: options.systemEnv,
      }).run(options.userInput);
    }
    case "opencode":
      return createOpenCodeRunner({
        model: options.model,
        cwd,
        env: base.env,
        abortController: base.abortController,
        systemPrompt: base.systemPrompt,
        yolo: base.yolo,
      }).run(options.userInput);
    case "copilot": {
      const reasoningEfforts = ["low", "medium", "high", "xhigh"];
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
      }).run(options.userInput);
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
