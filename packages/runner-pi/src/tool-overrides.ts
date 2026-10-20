/**
 * Tool overrides and secret guarding for bunny-agent pi runner.
 *
 * - The bash override injects only caller-declared env vars via spawnHook
 *   (`systemEnv`). Anything in the runner's `env` map (model auth, business
 *   credentials, native-tool API keys) stays in the runner process — it never
 *   reaches bash.
 * - {@link createSecretGuardExtension} uses pi's `tool_call` / `tool_result`
 *   hooks to block env-dump commands and to redact secret values from every
 *   tool result before the LLM sees it, using the full env map as the secret
 *   set.
 *
 * The bash override is registered via customTools so it replaces the built-in
 * tool of the same name.
 */

import {
  createBashToolDefinition,
  type InlineExtension,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  buildWebFetchTool,
  buildWebSearchTool,
  resolveSearchProvider,
} from "./web-tools.js";

/**
 * Scrub secret values from text.
 *
 * - Removes entire KEY=VALUE lines where a secret value appears (env/printenv output)
 * - Removes KEY: 'VALUE' / "KEY": "VALUE" entries (JSON/JS objects)
 * - Replaces any remaining bare occurrences with "***"
 * - Only values >= 8 chars are considered to avoid false positives
 */
export function redactSecrets(
  text: string,
  secrets: Record<string, string>,
): string {
  const values = Object.values(secrets)
    .filter((v) => v.length >= 8)
    .filter((v) => !/^\//.test(v) && !/^[A-Za-z]:[/\\]/.test(v)) // exclude filesystem paths
    .filter((v) => text.includes(v))
    .sort((a, b) => b.length - a.length);
  // Leave text without secrets byte-identical; this runs on every tool result.
  if (values.length === 0) return text;

  let result = text;
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
 * Detect commands that would dump environment variables to stdout or a file.
 * These are blocked to prevent secret exfiltration via env dump + file read.
 */
function isEnvDumpCommand(command: string): boolean {
  // Normalize: collapse whitespace, strip leading/trailing
  const cmd = command.replace(/\s+/g, " ").trim();
  // Match: env, printenv, export -p, `declare -x` — optionally piped or redirected
  return /(?:^|[|;&])\s*(?:env|printenv|export\s+-p|declare\s+-x)\b/.test(cmd);
}

export interface BashToolOptions {
  /**
   * Caller-declared env vars to inject into the bash spawn process. The
   * runner does NOT classify or filter — every key in this map is forwarded
   * to bash on top of the bash tool's default `ctx.env`. When omitted, bash
   * runs with only its default environment (the runner host's `process.env`).
   *
   * Routing is the caller's responsibility: anything secret that should not
   * reach bash belongs in the runner's `env` map instead.
   */
  systemEnv?: Record<string, string>;
  /**
   * Directory to prepend to the bash child's PATH. Used to expose harness
   * shims (currently the `apply_patch` command) to shell commands.
   */
  pathPrepend?: string;
}

/**
 * Build a custom "bash" ToolDefinition that injects caller-declared env vars
 * (and the harness PATH shims) via spawnHook, keeping them off the command
 * line. Only `opts.systemEnv` is forwarded to bash; the runner's `env` map is
 * never injected and is redacted from output by
 * {@link createSecretGuardExtension}.
 */
export function buildEnvInjectedBashTool(
  cwd: string,
  opts: BashToolOptions = {},
): ToolDefinition {
  const safeEnv = opts.systemEnv ?? {};
  const pathPrepend = opts.pathPrepend;
  // Typed renderer generics do not widen to the untyped ToolDefinition.
  return createBashToolDefinition(cwd, {
    spawnHook: (ctx) => {
      const env: Record<string, string | undefined> = {
        ...ctx.env,
        ...safeEnv,
      };
      if (pathPrepend) {
        const basePath = env.PATH ?? process.env.PATH;
        env.PATH = basePath ? `${pathPrepend}:${basePath}` : pathPrepend;
      }
      return { ...ctx, env };
    },
  }) as ToolDefinition;
}

export const ENV_DUMP_BLOCKED_MESSAGE =
  "Command blocked: printing or redirecting environment variables is not allowed.";

/**
 * Guard secrets through pi's tool hooks instead of wrapping individual tools,
 * so built-in, custom, toolRef and extension (MCP) tools are all covered —
 * including calls a codemode script makes:
 * - `tool_call`: block bash commands that dump the environment.
 * - `tool_result`: redact `secrets` values from text content before the LLM
 *   (and the session file) sees it. Replacing `content` drops
 *   `structuredContent`, which could carry the same values.
 */
export function createSecretGuardExtension(
  secrets: Record<string, string>,
): InlineExtension {
  return {
    name: "bunny-agent-secret-guard",
    factory: (pi) => {
      pi.on("tool_call", (event) => {
        if (
          event.toolName === "bash" &&
          typeof event.input.command === "string" &&
          isEnvDumpCommand(event.input.command)
        ) {
          return { block: true, reason: ENV_DUMP_BLOCKED_MESSAGE };
        }
        return undefined;
      });
      pi.on("tool_result", (event) => {
        let changed = false;
        const content = event.content.map((part) => {
          if (part.type !== "text") return part;
          const text = redactSecrets(part.text, secrets);
          if (text === part.text) return part;
          changed = true;
          return { ...part, text };
        });
        return changed ? { content } : undefined;
      });
    },
  };
}

/**
 * Build the tool overrides for the given env map.
 * Returns an array of ToolDefinitions to pass as customTools.
 *
 * Includes:
 * - bash: caller-declared `opts.systemEnv` injection
 * - web_search: auto-detected provider (Brave > Tavily), only if API key available
 * - web_fetch: URL content extraction (always available)
 *
 * `opts.systemEnv` (optional) is the only env that reaches bash. When
 * omitted, bash runs with just its default `ctx.env` (the runner host's
 * `process.env`). The `secrets` map only selects the search provider; it is
 * never injected into bash.
 */
export function buildSecretAwareTools(
  cwd: string,
  secrets: Record<string, string>,
  opts: BashToolOptions = {},
): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    buildEnvInjectedBashTool(cwd, opts),
    buildWebFetchTool(),
  ];

  if (resolveSearchProvider(secrets)) {
    tools.push(buildWebSearchTool(secrets));
  }

  return tools;
}
