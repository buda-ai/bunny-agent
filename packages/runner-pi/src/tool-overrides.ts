/**
 * Tool overrides for sandagent pi runner.
 *
 * - Injects secrets via bash commandPrefix (shell variables, not exported)
 *   so `env`/`printenv` cannot see them, but `$VAR` expansion works.
 * - Provides redactSecrets() for SSE output layer as a safety net.
 */

import {
  createCodingTools,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";

/**
 * Replace secret values with "***" in text.
 * Only values >= 4 chars are replaced to avoid false positives.
 */
export function redactSecrets(
  text: string,
  secrets: Record<string, string>,
): string {
  if (Object.keys(secrets).length === 0) return text;
  let result = text;

  const values = Object.values(secrets)
    .filter((v) => v.length >= 4)
    .sort((a, b) => b.length - a.length);

  for (const v of values) {
    result = result.split(v).join("***");
  }

  return result;
}

/**
 * Build a commandPrefix that sets secrets as shell variables (not exported).
 * `env`/`printenv` won't show them, but `$VAR` expansion works in commands.
 */
function buildCommandPrefix(secrets: Record<string, string>): string {
  return Object.entries(secrets)
    .map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'`)
    .join("\n");
}

/**
 * Build coding tools with secrets injected as shell variables via commandPrefix.
 *
 * Secrets are NOT exported, so:
 * - `echo $KEY` works (shell expansion)
 * - `env` / `printenv` cannot see them
 * - `node -e 'console.log(process.env.KEY)'` cannot see them
 *
 * For cases where a subprocess needs the value as an env var, the agent
 * can explicitly `export KEY` or use inline assignment: `KEY=$KEY cmd`.
 */
export function buildSecretAwareTools(
  cwd: string,
  secrets: Record<string, string>,
): ToolDefinition[] {
  const prefix = buildCommandPrefix(secrets);

  return createCodingTools(cwd, {
    bash: { commandPrefix: prefix },
  });
}
