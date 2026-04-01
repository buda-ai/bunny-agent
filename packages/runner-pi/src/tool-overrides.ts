/**
 * Tool overrides for sandagent pi runner.
 *
 * Builds custom bash and read ToolDefinitions that:
 * - Inject env vars into bash via spawnHook (secrets never in command string)
 * - Redact secret values from both bash and read tool output before the LLM sees them
 *
 * Registered via customTools so they override the built-in tools in
 * AgentSession._refreshToolRegistry's Map.set loop.
 */

import {
  createBashTool,
  createReadTool,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";

/**
 * Scrub secret values from text.
 *
 * - Removes entire KEY=VALUE lines where a secret value appears (env/printenv output)
 * - Removes KEY: 'VALUE' / "KEY": "VALUE" entries (JSON/JS objects)
 * - Replaces any remaining bare occurrences with "***"
 * - Only values >= 4 chars are considered to avoid false positives
 */
export function redactSecrets(
  text: string,
  secrets: Record<string, string>,
): string {
  if (Object.keys(secrets).length === 0) return text;
  let result = text;

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const values = Object.values(secrets)
    .filter((v) => v.length >= 4)
    .sort((a, b) => b.length - a.length);

  for (const v of values) {
    const ev = escapeRegex(v);
    // Remove entire KEY=VALUE lines where value appears
    result = result.replace(new RegExp(`^\\S+=.*${ev}.*$\\n?`, "gm"), "");
    // Remove KEY: 'VALUE' or "KEY": "VALUE" entries containing this value
    result = result.replace(
      new RegExp(`\\s*["']?\\w+["']?\\s*:\\s*['"][^'"]*${ev}[^'"]*['"],?`, "g"),
      "",
    );
    // Scrub any remaining bare occurrences
    result = result.split(v).join("***");
  }

  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

/**
 * Redact secret values from tool output content arrays.
 * Mutates in place so the LLM never sees raw secrets.
 */
function redactResultContent(
  // biome-ignore lint/suspicious/noExplicitAny: pi ToolResult shape
  result: any,
  secrets: Record<string, string>,
): void {
  if (result?.content && Array.isArray(result.content)) {
    result.content = result.content.map((c: { type: string; text?: string }) =>
      c.type === "text" && typeof c.text === "string"
        ? { ...c, text: redactSecrets(c.text, secrets) }
        : c,
    );
  }
}

/**
 * Build a custom "bash" ToolDefinition that:
 * 1. Injects env vars via spawnHook (secrets never in command string / procfs).
 * 2. Redacts secrets from output before the LLM sees them.
 * 3. Delegates execution to pi's createBashTool for full built-in behavior.
 */
export function buildEnvInjectedBashTool(
  cwd: string,
  extraEnv: Record<string, string>,
): ToolDefinition {
  const bashAgentTool = createBashTool(cwd, {
    spawnHook: (ctx) => ({
      ...ctx,
      env: { ...ctx.env, ...extraEnv },
    }),
  });

  return {
    name: bashAgentTool.name,
    label: bashAgentTool.label ?? "bash",
    description: bashAgentTool.description,
    // biome-ignore lint/suspicious/noExplicitAny: TypeBox schema from pi internals
    parameters: (bashAgentTool as any).parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      // biome-ignore lint/suspicious/noExplicitAny: delegate to pi's AgentTool execute
      const result = await (bashAgentTool as any).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
      );
      redactResultContent(result, extraEnv);
      return result;
    },
  };
}

/**
 * Build a custom "read" ToolDefinition that:
 * 1. Delegates file reading to pi's createReadTool (truncation, images, etc.).
 * 2. Redacts secrets from the returned file content before the LLM sees them.
 *
 * This prevents the agent from leaking secrets that happen to be stored in
 * files inside the workspace (e.g. .env copies, config dumps).
 */
export function buildSecretRedactingReadTool(
  cwd: string,
  secrets: Record<string, string>,
): ToolDefinition {
  const readAgentTool = createReadTool(cwd);

  return {
    name: readAgentTool.name,
    label: readAgentTool.label ?? "read",
    description: readAgentTool.description,
    // biome-ignore lint/suspicious/noExplicitAny: TypeBox schema from pi internals
    parameters: (readAgentTool as any).parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      // biome-ignore lint/suspicious/noExplicitAny: delegate to pi's AgentTool execute
      const result = await (readAgentTool as any).execute(
        toolCallId,
        params,
        signal,
        onUpdate,
      );
      redactResultContent(result, secrets);
      return result;
    },
  };
}

import {
  buildWebFetchTool,
  buildWebSearchTool,
  resolveSearchProvider,
} from "./web-tools.js";

/**
 * Build all secret-aware tool overrides for the given env map.
 * Returns an array of ToolDefinitions to pass as customTools.
 *
 * Includes:
 * - bash: env injection via spawnHook + secret redaction
 * - read: secret redaction on file content
 * - web_search: auto-detected provider (Brave > Tavily), only if API key available
 * - web_fetch: URL content extraction (always available)
 */
export function buildSecretAwareTools(
  cwd: string,
  secrets: Record<string, string>,
): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    buildEnvInjectedBashTool(cwd, secrets),
    buildSecretRedactingReadTool(cwd, secrets),
    buildWebFetchTool(),
  ];

  if (resolveSearchProvider(secrets)) {
    tools.push(buildWebSearchTool(secrets));
  }

  return tools;
}
