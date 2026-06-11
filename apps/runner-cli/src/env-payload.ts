/**
 * Reads & consumes one-shot env vars that carry sensitive payloads from the
 * SDK to runner-cli. "Take" semantics: each helper returns the parsed
 * payload and immediately deletes the source env var so subsequent child
 * processes (notably the pi runner's bash tool) cannot inherit it via
 * `process.env`.
 *
 * Currently only `BUNNY_AGENT_TOOL_REFS_JSON` lives here — toolRefs may
 * carry Bearer tokens / HTTP headers that must never reach bash. Plain
 * `env` / `systemEnv` go through normal `sandbox.exec({env})` because in
 * CLI mode each runner-cli invocation is single-request, and pi's default
 * `ctx.env` (= the runner's `process.env`) is the expected bash environment.
 */

import type { PiRunnerOptions } from "@bunny-agent/runner-pi";

type RunnerToolRefs = NonNullable<PiRunnerOptions["toolRefs"]>;
export type RunnerToolRefsPayload = { tools: RunnerToolRefs };

/**
 * Take `BUNNY_AGENT_TOOL_REFS_JSON`. Returns null when the var is absent or
 * malformed. The var is deleted before parsing so even malformed payloads
 * don't linger in `process.env` for subsequent spawns.
 */
export function takeToolRefsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RunnerToolRefsPayload | null {
  const raw = env.BUNNY_AGENT_TOOL_REFS_JSON;
  if (!raw) return null;
  delete env.BUNNY_AGENT_TOOL_REFS_JSON;
  try {
    const parsed = JSON.parse(raw) as { tools?: RunnerToolRefs };
    if (!Array.isArray(parsed.tools)) {
      console.error(
        "[bunny-agent] BUNNY_AGENT_TOOL_REFS_JSON missing tools array; ignoring.",
      );
      return null;
    }
    return { tools: parsed.tools };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[bunny-agent] Failed to parse BUNNY_AGENT_TOOL_REFS_JSON: ${message}`,
    );
    return null;
  }
}
