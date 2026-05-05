import type { ToolRef } from "@bunny-agent/manager";
import type { BaseRunnerOptions } from "@bunny-agent/runner-claude";
import { createClaudeRunner } from "@bunny-agent/runner-claude";
import { createCodexRunner } from "@bunny-agent/runner-codex";
import { createGeminiRunner } from "@bunny-agent/runner-gemini";
import { createOpenCodeRunner } from "@bunny-agent/runner-opencode";
import { createPiRunner } from "@bunny-agent/runner-pi";
import { loadSystemPrompt } from "./prompt.js";
import { buildToolDefinitions } from "./remote-tools.js";
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
   * Tool refs to expose to the LLM as native runner tools. Currently only
   * the `pi` runner consumes these; other runners ignore the field.
   */
  toolRefs?: ToolRef[];
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
      const customTools = resolveToolDefinitions(options);
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
 * Convert tool refs into pi-runner-native ToolDefinitions.
 *
 * Returns `undefined` when no tool refs are configured (the common path).
 */
function resolveToolDefinitions(
  options: RunnerCoreOptions,
): ReturnType<typeof buildToolDefinitions> | undefined {
  const tools = options.toolRefs;
  if (!tools || tools.length === 0) return undefined;
  return buildToolDefinitions(tools);
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
