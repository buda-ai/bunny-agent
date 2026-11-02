const SMOL_CLAUDE_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "AWS_BEARER_TOKEN_BEDROCK",
  "LITELLM_MASTER_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
] as const;

/** Forward only explicit Claude auth and endpoint settings to the sandbox. */
export function smolClaudeEnv(
  source: NodeJS.ProcessEnv,
): Record<string, string> {
  if (
    source.CLAUDE_CODE_USE_VERTEX === "1" &&
    !source.ANTHROPIC_API_KEY &&
    !source.ANTHROPIC_AUTH_TOKEN &&
    !source.AWS_BEARER_TOKEN_BEDROCK &&
    !source.LITELLM_MASTER_KEY &&
    !(
      source.CLAUDE_CODE_USE_BEDROCK === "1" &&
      source.ANTHROPIC_BEDROCK_BASE_URL
    )
  ) {
    throw new Error(
      "Smol VMs cannot use host-only Vertex ADC credentials; configure an Anthropic API key or supported proxy token",
    );
  }
  const env: Record<string, string> = {};
  for (const key of SMOL_CLAUDE_ENV_KEYS) {
    if (source[key]) env[key] = source[key];
  }
  return env;
}
