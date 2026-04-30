import type { RemoteToolSpec, ToolBridge } from "@bunny-agent/manager";
import type { BaseRunnerOptions } from "@bunny-agent/runner-claude";
import { createClaudeRunner } from "@bunny-agent/runner-claude";
import { createCodexRunner } from "@bunny-agent/runner-codex";
import { createGeminiRunner } from "@bunny-agent/runner-gemini";
import { createOpenCodeRunner } from "@bunny-agent/runner-opencode";
import { createPiRunner } from "@bunny-agent/runner-pi";
import { loadSystemPrompt } from "./prompt.js";
import { buildRemoteToolDefinitions } from "./remote-tools.js";
import { readSessionId, writeSessionId } from "./session.js";
import { discoverSkillPaths } from "./skills.js";

export interface RunnerCoreOptions extends BaseRunnerOptions {
  runner: string;
  userInput: string;
  skillPaths?: string[];
  cwd?: string;
  env?: Record<string, string>;
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
   * Remote tools to expose to the LLM as native runner tools. Currently only
   * the `pi` runner consumes these; other runners ignore the field.
   *
   * Each tool's `execute` is dispatched over HTTP to {@link toolBridge}, so
   * `tools` and `toolBridge` must appear together — the harness throws if one
   * is provided without the other.
   */
  tools?: RemoteToolSpec[];
  /** HTTP bridge used to invoke {@link tools} on the caller side. */
  toolBridge?: ToolBridge;
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
      return createClaudeRunner(base).run(options.userInput);
    case "codex": {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { outputFormat: _of, ...codexBase } = base;
      return createCodexRunner({ ...codexBase, cwd }).run(options.userInput);
    }
    case "gemini":
      return createGeminiRunner({
        model: options.model,
        cwd,
        env: base.env,
        abortController: base.abortController,
      }).run(options.userInput);
    case "pi": {
      const customTools = resolveRemoteToolDefinitions(options);
      return createPiRunner({
        ...base,
        cwd,
        sessionId: base.resume,
        skillPaths: options.skillPaths ?? discoverSkillPaths(cwd),
        ...(customTools ? { customTools } : {}),
      }).run(options.userInput);
    }
    case "opencode":
      return createOpenCodeRunner({
        model: options.model,
        cwd,
        env: base.env,
        abortController: base.abortController,
      }).run(options.userInput);
    case "copilot":
      throw new Error("Copilot runner not yet implemented");
    default:
      throw new Error(`Unknown runner: ${runner}`);
  }
}

/**
 * Validate the `tools` / `toolBridge` pair on RunnerCoreOptions and convert the
 * remote specs into pi-runner-native ToolDefinitions when both are present.
 *
 * Returns `undefined` when no remote tools are configured (the common path).
 * Throws when only one of `tools` / `toolBridge` is provided — that is a
 * caller bug we surface immediately instead of silently dropping tools.
 */
function resolveRemoteToolDefinitions(
  options: RunnerCoreOptions,
): ReturnType<typeof buildRemoteToolDefinitions> | undefined {
  const tools = options.tools;
  const bridge = options.toolBridge;
  const hasTools = !!tools && tools.length > 0;
  if (!hasTools && !bridge) return undefined;
  if (hasTools && !bridge) {
    throw new Error(
      "[bunny-agent:harness] `tools` was passed without `toolBridge`. Remote tools cannot " +
        "execute without a callback bridge — set both on RunnerCoreOptions.",
    );
  }
  if (!hasTools && bridge) {
    throw new Error(
      "[bunny-agent:harness] `toolBridge` was passed without any `tools`. Either remove " +
        "`toolBridge` or supply at least one tool spec.",
    );
  }
  return buildRemoteToolDefinitions(tools as RemoteToolSpec[], bridge as ToolBridge);
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
      } catch {}
    }
    yield chunk;
  }
}

export type { BaseRunnerOptions };
