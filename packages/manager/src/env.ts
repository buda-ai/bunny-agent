/**
 * Build a sanitised env record for spawning a runner child process.
 *
 * Responsibilities:
 * 1. Differentiate env by runner type (Claude vs Pi vs others).
 * 2. Claude: map Anthropic/Bedrock/LiteLLM credentials.
 * 3. Pi: map OpenAI/Gemini/Anthropic credentials and base URLs.
 * 4. Strip host-only vars (e.g. CLAUDE_CODE_SSE_PORT) that would make the SDK
 *    connect to the parent Claude Code instead of calling the API directly.
 */

export type RunnerType = "claude" | "pi" | "codex" | "gemini" | "opencode";

export interface RunnerEnvParams {
  /**
   * Runner type so env applies only the vars that runner needs.
   * Defaults to "claude" when omitted for backward compatibility.
   */
  runnerType?: RunnerType;
  /** Claude / Anthropic */
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  AWS_BEARER_TOKEN_BEDROCK?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  LITELLM_MASTER_KEY?: string;
  ANTHROPIC_BEDROCK_BASE_URL?: string;
  CLAUDE_CODE_USE_BEDROCK?: string;
  CLAUDE_CODE_SKIP_BEDROCK_AUTH?: string;
  /** Pi / Codex: OpenAI and Google */
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  /** Web search (cross-runner) */
  BRAVE_API_KEY?: string;
  TAVILY_API_KEY?: string;
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
 */
const STRIP_FROM_CHILD = new Set([
  "CLAUDE_CODE_SSE_PORT",
  "CLAUDE_CODE_SSE_SESSION_ID",
]);

function applyInherit(
  inherit: Record<string, string | undefined | null>,
  env: Record<string, string>,
): void {
  for (const [key, val] of Object.entries(inherit)) {
    if (val == null) continue;
    if (STRIP_FROM_CHILD.has(key)) continue;
    env[key] = String(val);
  }
}

/**
 * Env vars for Claude runner (Anthropic Agent SDK, Bedrock, LiteLLM).
 */
function applyClaudeRunnerEnv(
  params: RunnerEnvParams,
  env: Record<string, string>,
): void {
  const {
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    AWS_BEARER_TOKEN_BEDROCK,
    ANTHROPIC_AUTH_TOKEN,
    LITELLM_MASTER_KEY,
    ANTHROPIC_BEDROCK_BASE_URL,
    CLAUDE_CODE_USE_BEDROCK,
    CLAUDE_CODE_SKIP_BEDROCK_AUTH,
  } = params;

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
}

/**
 * Env vars for Pi runner (OpenAI, Gemini, Anthropic providers; base URLs).
 */
function applyPiRunnerEnv(
  params: RunnerEnvParams,
  env: Record<string, string>,
): void {
  const {
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    ANTHROPIC_AUTH_TOKEN,
    LITELLM_MASTER_KEY,
    ANTHROPIC_BEDROCK_BASE_URL,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
  } = params;

  if (OPENAI_API_KEY) env.OPENAI_API_KEY = OPENAI_API_KEY;
  if (OPENAI_BASE_URL) env.OPENAI_BASE_URL = OPENAI_BASE_URL;
  if (GEMINI_API_KEY) env.GEMINI_API_KEY = GEMINI_API_KEY;
  if (GEMINI_BASE_URL) env.GEMINI_BASE_URL = GEMINI_BASE_URL;

  if (ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
  if (ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = ANTHROPIC_BASE_URL;

  if (!env.ANTHROPIC_API_KEY && (ANTHROPIC_AUTH_TOKEN || LITELLM_MASTER_KEY)) {
    env.ANTHROPIC_API_KEY = ANTHROPIC_AUTH_TOKEN || LITELLM_MASTER_KEY || "";
  }
  if (ANTHROPIC_BEDROCK_BASE_URL && !env.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = ANTHROPIC_BEDROCK_BASE_URL;
  }
}

/**
 * Build the env record that should be passed to a runner child process.
 *
 * Applies inherit (stripped) first, then runner-specific credential vars.
 * Unknown runner types default to Claude for backward compatibility.
 *
 * @param params - Credential / proxy configuration and runner type.
 * @returns A plain `Record<string, string>` safe for child process env.
 */
export function buildRunnerEnv(
  params: RunnerEnvParams,
): Record<string, string> {
  const { runnerType = "claude", inherit = {} } = params;
  const env: Record<string, string> = {};

  applyInherit(inherit, env);

  switch (runnerType) {
    case "pi":
      applyPiRunnerEnv(params, env);
      break;
    default:
      applyClaudeRunnerEnv(params, env);
      break;
  }

  // Web search keys (all runners) — params override process.env
  const braveKey = params.BRAVE_API_KEY || process.env.BRAVE_API_KEY;
  const tavilyKey = params.TAVILY_API_KEY || process.env.TAVILY_API_KEY;
  if (braveKey) env.BRAVE_API_KEY = braveKey;
  if (tavilyKey) env.TAVILY_API_KEY = tavilyKey;

  return env;
}
