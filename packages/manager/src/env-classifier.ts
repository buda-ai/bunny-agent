/**
 * Classify environment variables into "system" (safe to expose to a bash
 * tool inside the agent) and "agent" (model auth, business API keys, anything
 * else the agent should never see in `process.env`).
 *
 * Default policy is whitelist-based: only known-safe keys / prefixes are
 * treated as system. Callers (CLI flag, daemon body field) may extend the
 * whitelist with extra keys when a specific bash command genuinely needs them.
 *
 * The classifier is deliberately permissive on POSIX/locale/toolchain vars and
 * deliberately strict on anything that looks like credentials. When in doubt,
 * a key falls into "agent" so it does not leak via `printenv` or process
 * inspection from inside the bash tool.
 */

/** Keys always treated as system env (safe to inject into bash). */
export const SYSTEM_ENV_KEYS: ReadonlySet<string> = new Set([
  // POSIX / shell
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "PWD",
  "OLDPWD",
  "HOSTNAME",
  "EDITOR",
  "VISUAL",
  "PAGER",
  // Locale / timezone
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "TZ",
  // Temp dirs
  "TMPDIR",
  "TMP",
  "TEMP",
  // Color / TTY hints
  "NO_COLOR",
  "FORCE_COLOR",
  "COLORTERM",
  "CLICOLOR",
  "CLICOLOR_FORCE",
  // Linker
  "LD_LIBRARY_PATH",
  "DYLD_LIBRARY_PATH",
  "DYLD_FALLBACK_LIBRARY_PATH",
  "MANPATH",
  // Common toolchain (non-credential)
  "PYTHONPATH",
  "PYTHONUNBUFFERED",
  "PYTHONDONTWRITEBYTECODE",
  "VIRTUAL_ENV",
  "GOPATH",
  "GOROOT",
  "CARGO_HOME",
  "RUSTUP_HOME",
  "JAVA_HOME",
  // CI / packaging hints
  "CI",
  "DEBIAN_FRONTEND",
  "DEBCONF_NONINTERACTIVE_SEEN",
]);

/**
 * Prefixes that mark an env key as system. Any key starting with one of these
 * is treated as safe-for-bash. Choose prefixes carefully: each one is a broad
 * commitment, so they should not overlap with vendor credentials.
 */
export const SYSTEM_ENV_PREFIXES: readonly string[] = [
  "LC_", // locale variants (LC_TIME, LC_NUMERIC, ...)
  "XDG_", // freedesktop spec
  "BUNNY_", // our own namespace (covers BUNNY_AGENT_*)
];

/**
 * Keys that must NEVER be treated as system, even if a caller adds them to
 * the extra whitelist. Defence-in-depth against accidentally promoting
 * credential-like keys via the BUNNY_AGENT_SYSTEM_ENV_KEYS escape hatch.
 *
 * This set is mirrored by the pi-runner's MODEL_AUTH_KEYS — if you change one,
 * audit the other.
 */
export const AGENT_ENV_FORCE_DENY: ReadonlySet<string> = new Set([
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "GEMINI_API_KEY",
  "GEMINI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "AWS_BEARER_TOKEN_BEDROCK",
  "LITELLM_MASTER_KEY",
]);

export interface ClassifyEnvOptions {
  /**
   * Extra keys to treat as system on top of the built-in whitelist.
   * Use to opt specific business keys back into bash — e.g. when a script
   * truly needs `MY_INTERNAL_TOOL_TOKEN` to be visible.
   *
   * Keys in {@link AGENT_ENV_FORCE_DENY} are still excluded.
   */
  extraSystemKeys?: Iterable<string>;
}

/**
 * Whether a single env key should be treated as system.
 *
 * Order: force-deny → built-in keys → extra whitelist → built-in prefixes.
 */
export function isSystemEnvKey(
  key: string,
  extraSystemKeys?: ReadonlySet<string>,
): boolean {
  if (AGENT_ENV_FORCE_DENY.has(key)) return false;
  if (SYSTEM_ENV_KEYS.has(key)) return true;
  if (extraSystemKeys?.has(key)) return true;
  for (const prefix of SYSTEM_ENV_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

export interface ClassifiedEnv {
  /** Keys classified as system — safe to inject into bash. */
  system: Record<string, string>;
  /** Keys classified as agent — kept for runner / native tools / redaction. */
  agent: Record<string, string>;
}

/**
 * Split an env map into system and agent partitions according to the policy
 * encoded by {@link isSystemEnvKey}.
 *
 * Pure function — does not read `process.env`. Inputs whose value is `null`
 * or `undefined` are dropped (mirrors child_process's coercion behaviour).
 */
export function classifyEnv(
  env: Record<string, string | undefined | null>,
  opts: ClassifyEnvOptions = {},
): ClassifiedEnv {
  const extra = toSet(opts.extraSystemKeys);
  const system: Record<string, string> = {};
  const agent: Record<string, string> = {};
  for (const [key, raw] of Object.entries(env)) {
    if (raw == null) continue;
    const val = String(raw);
    if (isSystemEnvKey(key, extra)) {
      system[key] = val;
    } else {
      agent[key] = val;
    }
  }
  return { system, agent };
}

/**
 * Parse `BUNNY_AGENT_SYSTEM_ENV_KEYS` (comma-separated key names) into a Set
 * usable as `extraSystemKeys`. Empty / missing → empty set.
 *
 * This env var is the production escape hatch: if a deployment urgently
 * needs a key inside bash without redeploying the daemon, operators can set
 * `BUNNY_AGENT_SYSTEM_ENV_KEYS=K1,K2` on the daemon host.
 */
export function parseSystemEnvKeysFromEnv(
  env: Record<string, string | undefined> = process.env,
): Set<string> {
  const raw = env.BUNNY_AGENT_SYSTEM_ENV_KEYS;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

function toSet(
  extra: Iterable<string> | undefined,
): ReadonlySet<string> | undefined {
  if (!extra) return undefined;
  if (extra instanceof Set) return extra;
  return new Set(extra);
}
