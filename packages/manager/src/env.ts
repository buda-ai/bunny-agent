/**
 * Build a sanitised env record for spawning a runner (Claude Agent SDK) child process.
 *
 * Responsibilities:
 * 1. Map credential params into the env vars the SDK actually reads.
 * 2. Derive AWS_BEARER_TOKEN_BEDROCK when using a Bedrock proxy with only
 *    ANTHROPIC_AUTH_TOKEN / LITELLM_MASTER_KEY.
 * 3. Strip host-only vars (e.g. CLAUDE_CODE_SSE_PORT) that would make the SDK
 *    connect to the parent IDE's Claude Code instead of calling the API directly.
 */

export interface RunnerEnvParams {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  AWS_BEARER_TOKEN_BEDROCK?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  LITELLM_MASTER_KEY?: string;
  ANTHROPIC_BEDROCK_BASE_URL?: string;
  CLAUDE_CODE_USE_BEDROCK?: string;
  CLAUDE_CODE_SKIP_BEDROCK_AUTH?: string;
  /**
   * Base env to merge in (lowest priority).
   * Typically `process.env` for local sandbox, or extra vars from the request.
   * Null/undefined values and parent Claude Code keys (CLAUDE_CODE_SSE_PORT
   * etc.) are automatically stripped.
   */
  inherit?: Record<string, string | undefined | null>;
}

/**
 * Env vars that must NOT be forwarded to the runner child process.
 * CLAUDE_CODE_SSE_PORT / SESSION_ID are set by a parent Claude Code process
 * and would make the child SDK connect back to the host via SSE instead of
 * performing its own independent API calls.
 */
const STRIP_FROM_CHILD = new Set([
  "CLAUDE_CODE_SSE_PORT",
  "CLAUDE_CODE_SSE_SESSION_ID",
]);

/**
 * Build the env record that should be passed to a runner child process.
 *
 * Merges `inherit` (stripped & stringified) as base, then layers credential
 * vars on top. The result is ready to pass directly to `spawn()`.
 *
 * @param params - Credential / proxy configuration coming from the request body.
 * @returns A plain `Record<string, string>` safe for child process env.
 */
export function buildRunnerEnv(
  params: RunnerEnvParams,
): Record<string, string> {
  const {
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    AWS_BEARER_TOKEN_BEDROCK,
    ANTHROPIC_AUTH_TOKEN,
    LITELLM_MASTER_KEY,
    ANTHROPIC_BEDROCK_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_SKIP_BEDROCK_AUTH,
    inherit = {},
  } = params;

  const env: Record<string, string> = {};

  for (const [key, val] of Object.entries(inherit)) {
    if (val == null) continue;
    if (STRIP_FROM_CHILD.has(key)) continue;
    env[key] = String(val);
  }

  if (ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
  if (ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = ANTHROPIC_BASE_URL;

  if (AWS_BEARER_TOKEN_BEDROCK) {
    env.AWS_BEARER_TOKEN_BEDROCK = AWS_BEARER_TOKEN_BEDROCK;
    env.CLAUDE_CODE_USE_BEDROCK = "1";
  }

  if (ANTHROPIC_AUTH_TOKEN) env.ANTHROPIC_AUTH_TOKEN = ANTHROPIC_AUTH_TOKEN;
  if (LITELLM_MASTER_KEY) env.LITELLM_MASTER_KEY = LITELLM_MASTER_KEY;

  if (ANTHROPIC_BEDROCK_BASE_URL) {
    env.ANTHROPIC_BEDROCK_BASE_URL = ANTHROPIC_BEDROCK_BASE_URL;
    env.CLAUDE_CODE_USE_BEDROCK = CLAUDE_CODE_USE_BEDROCK || "1";
    env.CLAUDE_CODE_SKIP_BEDROCK_AUTH = CLAUDE_CODE_SKIP_BEDROCK_AUTH || "1";

    if (!env.AWS_BEARER_TOKEN_BEDROCK) {
      const proxyKey = ANTHROPIC_AUTH_TOKEN || LITELLM_MASTER_KEY;
      if (proxyKey) env.AWS_BEARER_TOKEN_BEDROCK = proxyKey;
    }
  }

  return env;
}
