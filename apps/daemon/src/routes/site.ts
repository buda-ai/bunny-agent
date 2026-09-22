import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ApiEnvelope, AppState } from "../utils.js";
import { AppError, ok } from "../utils.js";

// Inline JSONC parser — strips `//` and `/* */` comments before JSON.parse.
// This avoids adding a dependency solely for reading wrangler.jsonc.
function parseJsonc(text: string): unknown {
  // Remove block comments
  let stripped = text.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove line comments (but not inside strings — good-enough for wrangler configs)
  stripped = stripped.replace(/\/\/[^\n]*/g, "");
  return JSON.parse(stripped);
}

// =============================================================================
// Branded primitive types
// =============================================================================

/**
 * A non-empty absolute filesystem path string.
 * Branding prevents accidental use of unvalidated strings as directory paths.
 */
export type AbsolutePath = string & { readonly __brand: "AbsolutePath" };

/**
 * A validated Cloudflare Worker script name:
 * 1–64 chars, only [A-Za-z0-9_-].
 */
export type ScriptName = string & { readonly __brand: "ScriptName" };

// =============================================================================
// Domain enums and constants
// =============================================================================

/** Supported project frameworks. */
export type FrameworkType = "vite" | "nextjs";

/** Ordered candidate paths for Vite build artifacts (highest priority first). */
const VITE_ARTIFACT_CANDIDATES = [
  ".output/worker.js",
  "dist/worker.js",
] as const;

/** Vite config filenames checked during framework detection (in order). */
const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.js"] as const;

/** Next.js config filenames checked during framework detection (in order). */
const NEXTJS_CONFIG_FILES = [
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
] as const;

// =============================================================================
// Public request / response types
// =============================================================================

/** Deployment environment — controls the suffix appended to the script name. */
export type DeployEnvironment = "production" | "preview";

/** Parsed, validated body for POST /api/site/deploy and /api/site/redeploy. */
export interface DeployBody {
  /** Absolute path to the user's project directory on the local filesystem. */
  readonly projectDir: AbsolutePath;
  /** Validated Cloudflare Worker script name (identifier in dispatch namespace). */
  readonly scriptName: ScriptName;
  /**
   * Target deployment environment.
   * Determines the suffix appended to `scriptName`:
   *   - `"production"` → `<scriptName>_production` (default)
   *   - `"preview"`    → `<scriptName>_preview`
   */
  readonly environment: DeployEnvironment;
  /** Cloudflare credentials extracted from the request body `env` map. */
  readonly cloudflareEnv: CloudflareEnv;
  /**
   * Safe application variables extracted from the request body `env` map.
   * These become Worker runtime bindings through temporary Wrangler config.
   * Deployment credentials and reserved platform/process-control names are
   * removed at the daemon trust boundary.
   */
  readonly applicationEnv: Record<string, string>;
}

/** Parsed, validated body for POST /api/site/delete. */
export interface DeleteBody {
  /** Validated Cloudflare Worker script name to delete. */
  readonly scriptName: ScriptName;
  /** Cloudflare credentials extracted from the request body `env` map. */
  readonly cloudflareEnv: CloudflareEnv;
}

/** Success payload returned by POST /api/site/deploy and /api/site/redeploy. */
export interface DeployResult {
  readonly scriptName: ScriptName;
  readonly dispatchNamespace: string;
  readonly framework: FrameworkType;
  readonly environment: DeployEnvironment;
  /** Number of caller-supplied application variables published as Worker bindings. */
  readonly applicationEnvBindingCount: number;
}

/** Success payload returned by POST /api/site/delete. */
export interface DeleteResult {
  readonly scriptName: ScriptName;
  readonly dispatchNamespace: string;
  readonly deleted: true;
}

// =============================================================================
// Internal types
// =============================================================================

/**
 * Resolved Cloudflare credentials.
 * Sourced from the request body `env` map — never from `process.env` directly.
 */
interface CloudflareEnv {
  readonly apiToken: string;
  readonly accountId: string;
  readonly dispatchNamespace: string;
}

interface WorkerBinding {
  readonly name?: string;
  readonly type?: string;
  readonly [key: string]: unknown;
}

interface CloudflareResponse<T> {
  readonly success?: boolean;
  readonly result?: T;
  readonly errors?: Array<{ readonly message?: string }>;
}

/** Exact environment names callers may not control or publish as bindings. */
const RESERVED_ENV_NAMES = new Set([
  "AGENT_KEY",
  "BASH_ENV",
  "CDPATH",
  "ENV",
  "HOME",
  "IFS",
  "LD_LIBRARY_PATH",
  "LD_PRELOAD",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PATH",
  "PNPM_HOME",
  "PS4",
  "SHELLOPTS",
]);

/** Platform and deployment-tool prefixes callers may not publish or control. */
const RESERVED_ENV_PREFIXES = [
  "AGENT_",
  "BUDA_",
  "CF_",
  "CLOUDFLARE_",
  "NPM_",
  "PNPM_",
  "SANDBOX_",
  "SANDOCK_",
  "WRANGLER_",
] as const;

/** Host variables required for process lookup, temporary files, and Windows. */
const WRANGLER_EXECUTION_ENV_NAMES = new Set([
  "APPDATA",
  "COMSPEC",
  "HOME",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USERPROFILE",
  "WINDIR",
]);

// =============================================================================
// Type guards
// =============================================================================

/** Narrows `unknown` to a plain object (non-null, non-array). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Narrows `unknown` to a non-empty, non-whitespace string. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// =============================================================================
// Brand constructors (validate then brand)
// =============================================================================

/**
 * Validates a script name string and brands it as `ScriptName`.
 * Exported as `validateScriptName` for backward-compatibility with tests.
 * Throws AppError(400) on any violation.
 */
export function validateScriptName(raw: string): ScriptName {
  if (raw.trim().length === 0) {
    throw new AppError(400, "scriptName is required");
  }
  if (raw.length > 64) {
    throw new AppError(400, "scriptName must be 64 characters or fewer");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw new AppError(
      400,
      "scriptName must contain only alphanumeric characters, hyphens, and underscores",
    );
  }
  return raw as ScriptName;
}

/** Alias kept for internal call-sites that read as "construct a ScriptName". */
const toScriptName = validateScriptName;

/**
 * Brands a raw string as an `AbsolutePath` after confirming it is non-empty.
 * Full filesystem existence is checked separately by `detectFramework`.
 * Throws AppError(400) if blank.
 */
function toAbsolutePath(raw: string): AbsolutePath {
  if (raw.trim().length === 0) {
    throw new AppError(400, "projectDir is required");
  }
  return raw as AbsolutePath;
}

// =============================================================================
// Environment validation
// =============================================================================

/**
 * Extracts and validates the three required Cloudflare credentials from the
 * caller-supplied `env` map (sourced from the request body, not `process.env`).
 *
 * All three keys are checked up-front before any SDK call so a missing value
 * surfaces as a clear 400 rather than an opaque authentication failure.
 * Throws AppError(400) for any missing or empty key.
 */
export function validateEnv(env: Record<string, string>): CloudflareEnv {
  const entries = [
    ["CLOUDFLARE_API_TOKEN", "apiToken"],
    ["CLOUDFLARE_ACCOUNT_ID", "accountId"],
    ["CLOUDFLARE_DISPATCH_NAMESPACE", "dispatchNamespace"],
  ] as const satisfies ReadonlyArray<readonly [string, keyof CloudflareEnv]>;

  const result = {} as Record<keyof CloudflareEnv, string>;

  for (const [key, field] of entries) {
    const value = env[key];
    if (!value) {
      throw new AppError(400, `missing required env key: ${key}`);
    }
    result[field] = value;
  }

  return result as CloudflareEnv;
}

/**
 * Returns caller variables that are safe to expose to Worker code. Names are
 * checked case-insensitively so the policy is consistent on Windows, and
 * invalid binding identifiers are omitted. Reserved values are stripped rather
 * than reflected in errors.
 */
export function filterApplicationEnv(
  env: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => isSafeApplicationEnvName(name)),
  );
}

function isSafeApplicationEnvName(name: string): boolean {
  const normalizedName = name.toUpperCase();
  return (
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
    !RESERVED_ENV_NAMES.has(normalizedName) &&
    !RESERVED_ENV_PREFIXES.some((prefix) => normalizedName.startsWith(prefix))
  );
}

/** Builds the isolated environment used by Wrangler deploy and delete. */
function buildWranglerEnvironment(env: CloudflareEnv): NodeJS.ProcessEnv {
  const executionEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name, value]) =>
        value !== undefined &&
        WRANGLER_EXECUTION_ENV_NAMES.has(name.toUpperCase()),
    ),
  );

  return {
    ...executionEnv,
    CLOUDFLARE_API_TOKEN: env.apiToken,
    CLOUDFLARE_ACCOUNT_ID: env.accountId,
    CLOUDFLARE_DISPATCH_NAMESPACE: env.dispatchNamespace,
  };
}

async function readCloudflareJson<T>(
  response: Response,
): Promise<CloudflareResponse<T>> {
  return (await response.json().catch(() => ({}))) as CloudflareResponse<T>;
}

function cloudflareErrorMessage(
  response: CloudflareResponse<unknown>,
  status: number,
): string {
  const detail = response.errors
    ?.map((error) => error.message)
    .filter(Boolean)
    .join("; ");
  return detail || `Cloudflare API request failed with status ${status}`;
}

/**
 * Wrangler's dispatch-namespace deploy currently uploads the script but does
 * not reliably persist config `vars` as namespace-script bindings. Patch the
 * namespace-scoped settings explicitly, preserving all existing non-replaced
 * bindings, then read the settings back so a successful deploy cannot silently
 * omit application configuration.
 */
export async function publishApplicationEnvBindings(
  scriptName: ScriptName,
  env: CloudflareEnv,
  applicationEnv: Record<string, string>,
): Promise<number> {
  const safeApplicationEnv = filterApplicationEnv(applicationEnv);
  const requestedNames = Object.keys(safeApplicationEnv);
  if (requestedNames.length === 0) return 0;

  const settingsUrl =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.accountId)}` +
    `/workers/dispatch/namespaces/${encodeURIComponent(env.dispatchNamespace)}` +
    `/scripts/${encodeURIComponent(scriptName)}/settings`;
  const headers = { Authorization: `Bearer ${env.apiToken}` };

  const currentResponse = await fetch(settingsUrl, { headers });
  const current = await readCloudflareJson<{ bindings?: WorkerBinding[] }>(
    currentResponse,
  );
  if (!currentResponse.ok || !current.success) {
    throw new AppError(
      502,
      cloudflareErrorMessage(current, currentResponse.status),
    );
  }

  const requestedNameSet = new Set(requestedNames);
  const preservedBindings = (current.result?.bindings ?? []).filter(
    (binding) => !binding.name || !requestedNameSet.has(binding.name),
  );
  const applicationBindings = Object.entries(safeApplicationEnv).map(
    ([name, text]) => ({
      name,
      text,
      type: "plain_text" as const,
    }),
  );
  const settings = {
    bindings: [...preservedBindings, ...applicationBindings],
  };
  const formData = new FormData();
  formData.append(
    "settings",
    new Blob([JSON.stringify(settings)], { type: "application/json" }),
  );

  const patchResponse = await fetch(settingsUrl, {
    method: "PATCH",
    headers,
    body: formData,
  });
  const patched = await readCloudflareJson<{ bindings?: WorkerBinding[] }>(
    patchResponse,
  );
  if (!patchResponse.ok || !patched.success) {
    throw new AppError(
      502,
      cloudflareErrorMessage(patched, patchResponse.status),
    );
  }

  const verifyResponse = await fetch(settingsUrl, { headers });
  const verified = await readCloudflareJson<{ bindings?: WorkerBinding[] }>(
    verifyResponse,
  );
  if (!verifyResponse.ok || !verified.success) {
    throw new AppError(
      502,
      cloudflareErrorMessage(verified, verifyResponse.status),
    );
  }

  const publishedNames = new Set(
    (verified.result?.bindings ?? [])
      .filter(
        (binding) =>
          binding.type === "plain_text" && typeof binding.name === "string",
      )
      .map((binding) => binding.name as string),
  );
  const missingNames = requestedNames.filter(
    (name) => !publishedNames.has(name),
  );
  if (missingNames.length > 0) {
    throw new AppError(
      502,
      `Cloudflare omitted application bindings: ${missingNames.join(", ")}`,
    );
  }

  return requestedNames.length;
}

// =============================================================================
// Request body parsing
// =============================================================================

/**
 * Parses and validates a deploy/redeploy request body.
 *
 * The router passes `params` as `Record<string, unknown>`, but this function
 * accepts raw `unknown` so it can be called directly in tests without casting.
 * Returns a strongly-typed `DeployBody` with branded field types on success.
 * Throws AppError(400) on any validation failure.
 *
 * Cloudflare credentials and application variables are read from the `env`
 * field of the request body. Reserved variables are excluded from application
 * bindings, and application variables never enter the local deploy process.
 */
export function parseDeployBody(raw: unknown): DeployBody {
  if (!isPlainObject(raw)) {
    throw new AppError(400, "request body must be a JSON object");
  }

  if (!isNonEmptyString(raw.projectDir)) {
    throw new AppError(400, "projectDir is required");
  }
  if (!isNonEmptyString(raw.scriptName)) {
    throw new AppError(400, "scriptName is required");
  }

  let environment: DeployEnvironment = "production";
  if (raw.environment !== undefined) {
    if (raw.environment !== "production" && raw.environment !== "preview") {
      throw new AppError(400, 'environment must be "production" or "preview"');
    }
    environment = raw.environment as DeployEnvironment;
  }

  // Extract credentials from the `env` map in the request body.
  const envMap =
    isPlainObject(raw.env) &&
    Object.values(raw.env).every((v) => typeof v === "string")
      ? (raw.env as Record<string, string>)
      : {};
  const cloudflareEnv = validateEnv(envMap);
  const applicationEnv = filterApplicationEnv(envMap);

  return {
    projectDir: toAbsolutePath(raw.projectDir),
    scriptName: toScriptName(raw.scriptName),
    environment,
    cloudflareEnv,
    applicationEnv,
  };
}

/**
 * Parses and validates a delete request body.
 * Returns a strongly-typed `DeleteBody` with a branded `scriptName` on success.
 * Throws AppError(400) on any validation failure.
 *
 * Cloudflare credentials are read from the `env` field of the request body
 * (a `Record<string, string>`) — never from `process.env`.
 */
export function parseDeleteBody(raw: unknown): DeleteBody {
  if (!isPlainObject(raw)) {
    throw new AppError(400, "request body must be a JSON object");
  }

  if (!isNonEmptyString(raw.scriptName)) {
    throw new AppError(400, "scriptName is required");
  }

  // Extract credentials from the `env` map in the request body.
  const envMap =
    isPlainObject(raw.env) &&
    Object.values(raw.env).every((v) => typeof v === "string")
      ? (raw.env as Record<string, string>)
      : {};
  const cloudflareEnv = validateEnv(envMap);

  return { scriptName: toScriptName(raw.scriptName), cloudflareEnv };
}

// =============================================================================
// Framework detection
// =============================================================================

/**
 * Detects the project framework by checking for well-known config files.
 * Vite is checked first — it wins if both Vite and Next.js configs are present.
 *
 * Throws AppError(400) if:
 * - The directory does not exist or is not accessible (treated identically).
 * - No supported framework config file is found.
 */
export async function detectFramework(
  projectDir: AbsolutePath,
): Promise<FrameworkType> {
  try {
    await fs.access(projectDir);
  } catch {
    // Treat ENOENT and EACCES the same — "directory not found" from caller's perspective.
    throw new AppError(400, `project directory not found: ${projectDir}`);
  }

  for (const configFile of VITE_CONFIG_FILES) {
    try {
      await fs.access(path.join(projectDir, configFile));
      return "vite";
    } catch {
      // not present, continue
    }
  }

  for (const configFile of NEXTJS_CONFIG_FILES) {
    try {
      await fs.access(path.join(projectDir, configFile));
      return "nextjs";
    } catch {
      // not present, continue
    }
  }

  throw new AppError(
    400,
    "unsupported framework: no vite.config or next.config found",
  );
}

// =============================================================================
// Vite + Next.js deploy via wrangler
// =============================================================================

/**
 * Wrangler config filenames tried in order when patching the `name` field.
 * Only JSON/JSONC are supported for in-place patching; wrangler.toml is not.
 */
const WRANGLER_CONFIG_FILENAMES = ["wrangler.jsonc", "wrangler.json"] as const;

/**
 * Deploys a Vite project by delegating to `npx wrangler deploy`.
 *
 * Strategy:
 * 1. Check for an existing wrangler config (`wrangler.jsonc` or `wrangler.json`).
 *    - If found: delegate to `deployNextjsWithWrangler` which patches the `name`
 *      field, deploys, then restores the original config.
 *    - If not found: probe for the first built artifact (.output/worker.js or
 *      dist/worker.js) to use as `main`, generate a minimal `wrangler.json`,
 *      deploy via `deployNextjsWithWrangler`, then delete the generated config.
 *      If no artifact exists yet, throws AppError(400) with actionable build instructions.
 *
 * Throws AppError(400) if no artifact is found and no wrangler config exists.
 * Throws AppError(500) if wrangler is not available or exits with a non-zero code.
 */
export async function deployViteWithWrangler(
  scriptName: ScriptName,
  projectDir: AbsolutePath,
  env: CloudflareEnv,
  applicationEnv: Record<string, string> = {},
): Promise<void> {
  // Check for an existing wrangler config.
  let hasConfig = false;
  for (const filename of WRANGLER_CONFIG_FILENAMES) {
    try {
      await fs.access(path.join(projectDir, filename));
      hasConfig = true;
      break;
    } catch {
      // not found, try next
    }
  }

  if (hasConfig) {
    // ── Existing config: delegate entirely to the Next.js deploy path ──────
    await deployNextjsWithWrangler(scriptName, projectDir, env, applicationEnv);
  } else {
    // ── No config: generate a minimal wrangler.json, deploy, then remove ───
    //
    // Probe for a built artifact to use as the `main` entry point.
    let relativeMain: string | undefined;
    for (const candidate of VITE_ARTIFACT_CANDIDATES) {
      try {
        await fs.access(path.join(projectDir, candidate));
        relativeMain = candidate;
        break;
      } catch {
        // not present, try next
      }
    }

    const generatedConfigPath = path.join(projectDir, "wrangler.json");
    const minimalConfig = {
      name: scriptName,
      main: relativeMain,
      compatibility_date: "2025-01-01",
    };

    let generatedConfigCreated = false;
    try {
      await fs.writeFile(
        generatedConfigPath,
        JSON.stringify(minimalConfig, null, "\t"),
        "utf8",
      );
      generatedConfigCreated = true;
      // Delegate to the shared deploy path — it will find and use the generated config.
      await deployNextjsWithWrangler(
        scriptName,
        projectDir,
        env,
        applicationEnv,
      );
    } finally {
      if (generatedConfigCreated) {
        await fs.unlink(generatedConfigPath);
      }
    }
  }
}

/**
 * Deploys a Next.js project by delegating entirely to `npx wrangler deploy`.
 *
 * Strategy:
 * 1. Locate the wrangler config file (`wrangler.jsonc` or `wrangler.json`).
 * 2. Parse it, overwrite `name`, and merge safe application variables into
 *    top-level `vars`. Explicit caller values override same-named config vars.
 * 3. Spawn `npx wrangler deploy` in the project directory, forwarding
 *    `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the environment.
 * 4. Restore the original config content regardless of success or failure.
 *
 * Using wrangler avoids the need to manually replicate its module bundling,
 * JSON-manifest uploads, asset handling, and compatibility-flag logic.
 *
 * Throws AppError(400) if no wrangler config file is found.
 * Throws AppError(500) if wrangler exits with a non-zero code.
 */
export async function deployNextjsWithWrangler(
  scriptName: ScriptName,
  projectDir: AbsolutePath,
  env: CloudflareEnv,
  applicationEnv: Record<string, string> = {},
): Promise<void> {
  const safeApplicationEnv = filterApplicationEnv(applicationEnv);

  // Locate the wrangler config file.
  let configPath: string | null = null;
  for (const filename of WRANGLER_CONFIG_FILENAMES) {
    const candidate = path.join(projectDir, filename);
    try {
      await fs.access(candidate);
      configPath = candidate;
      break;
    } catch {
      // not found, try next
    }
  }

  if (configPath === null) {
    throw new AppError(
      400,
      "wrangler config not found: expected wrangler.jsonc or wrangler.json in project directory",
    );
  }

  // Read original content — preserved for restoration.
  const originalContent = await fs.readFile(configPath, "utf8");

  // Parse, patch the name, and write back.
  let parsed: unknown;
  try {
    parsed = parseJsonc(originalContent);
  } catch {
    throw new AppError(400, `failed to parse wrangler config: ${configPath}`);
  }

  if (!isPlainObject(parsed)) {
    throw new AppError(400, "wrangler config must be a JSON object");
  }

  const originalName = typeof parsed.name === "string" ? parsed.name : null;

  const patched: Record<string, unknown> = { ...parsed, name: scriptName };

  // Rewrite service bindings that reference the original worker name so
  // self-references (e.g. WORKER_SELF_REFERENCE) point to the new scriptName.
  if (originalName && Array.isArray(patched.services)) {
    patched.services = (patched.services as Array<Record<string, unknown>>).map(
      (svc) =>
        svc.service === originalName ? { ...svc, service: scriptName } : svc,
    );
  }

  // Detect whether any service bindings are self-referential (i.e. they point
  // to the same worker being deployed). Wrangler validates service bindings
  // by checking account-level worker scripts (/workers/scripts/<name>/settings),
  // but workers deployed to a dispatch namespace only exist at the namespace-
  // scoped path (/workers/dispatch/namespaces/<ns>/scripts/<name>). This means
  // wrangler's binding validation always fails for workers in a dispatch
  // namespace — Cloudflare API error 10143. The self-reference is used by
  // OpenNext for ISR cache revalidation (memory queue), which is not compatible
  // with dispatch namespace deployments. We strip it to allow the deploy to
  // succeed; the worker still functions normally for SSR and static assets.
  const servicesWithoutSelfRef = Array.isArray(patched.services)
    ? (patched.services as Array<Record<string, unknown>>).filter(
        (svc) => svc.service !== scriptName,
      )
    : [];

  const deployConfig: Record<string, unknown> = { ...patched };
  if (servicesWithoutSelfRef.length === 0) {
    delete deployConfig.services;
  } else {
    deployConfig.services = servicesWithoutSelfRef;
  }

  if (
    deployConfig.vars !== undefined ||
    Object.keys(safeApplicationEnv).length > 0
  ) {
    if (deployConfig.vars !== undefined && !isPlainObject(deployConfig.vars)) {
      throw new AppError(400, "wrangler config vars must be a JSON object");
    }
    const safeConfigVars = Object.fromEntries(
      Object.entries(deployConfig.vars ?? {}).filter(([name]) =>
        isSafeApplicationEnvName(name),
      ),
    );
    deployConfig.vars = {
      ...safeConfigVars,
      ...safeApplicationEnv,
    };
  }

  try {
    await fs.writeFile(
      configPath,
      JSON.stringify(deployConfig, null, "\t"),
      "utf8",
    );
    await runWranglerDeploy(projectDir, env, scriptName);
  } finally {
    // Always restore the original config, even on error.
    await fs.writeFile(configPath, originalContent, "utf8");
  }
}

/**
 * Spawns `npx wrangler deploy --dispatch-namespace <namespace>` inside `projectDir`.
 *
 * The `--dispatch-namespace` flag targets the Workers for Platforms dispatch
 * namespace so the user Worker is scoped to the namespace rather than being
 * deployed as a standalone account-level Worker.
 *
 * Uses only the host variables needed to execute npx across supported
 * platforms and validated Cloudflare credentials. Application variables are
 * delivered through Wrangler config and never enter this local environment.
 * The daemon's remaining environment is not inherited.
 *
 * Resolves when wrangler exits with code 0.
 * Throws AppError(500) on non-zero exit or spawn error.
 */
function runWranglerDeploy(
  projectDir: AbsolutePath,
  env: CloudflareEnv,
  scriptName: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "wrangler",
        "deploy",
        "--name",
        scriptName,
        "--dispatch-namespace",
        env.dispatchNamespace,
      ],
      {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: buildWranglerEnvironment(env),
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(new AppError(500, `failed to spawn wrangler: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const detail = (stderr || stdout).trim();
        reject(
          new AppError(
            500,
            `wrangler deploy exited with code ${code}${detail ? ": " + detail : ""}`,
          ),
        );
      }
    });
  });
}

/**
 * Deletes a named worker from the dispatch namespace via `npx wrangler delete`.
 * Throws AppError(500) if wrangler exits with a non-zero code.
 */
export async function deleteWorker(
  scriptName: ScriptName,
  env: CloudflareEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "wrangler",
        "delete",
        "--name",
        scriptName,
        "--dispatch-namespace",
        env.dispatchNamespace,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: buildWranglerEnvironment(env),
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(new AppError(500, `failed to spawn wrangler: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const detail = (stderr || stdout).trim();
        reject(
          new AppError(
            500,
            `wrangler delete exited with code ${code}${detail ? ": " + detail : ""}`,
          ),
        );
      }
    });
  });
}

// =============================================================================
// Deploy pipeline
// =============================================================================

/**
 * Shared pipeline for deploy and redeploy:
 *   validateEnv → parseDeployBody → detectFramework → deploy via wrangler
 *
 * Both Next.js and Vite patch (or generate) a wrangler config with scriptName,
 * then run `npx wrangler deploy`. Any step failure throws an AppError.
 */
export async function runDeployPipeline(raw: unknown): Promise<DeployResult> {
  const {
    projectDir,
    scriptName: originalScriptName,
    environment,
    cloudflareEnv,
    applicationEnv,
  } = parseDeployBody(raw);
  const scriptName = toScriptName(`${originalScriptName}`);
  const framework = await detectFramework(projectDir);

  if (framework === "nextjs") {
    await deployNextjsWithWrangler(
      scriptName,
      projectDir,
      cloudflareEnv,
      applicationEnv,
    );
  } else {
    await deployViteWithWrangler(
      scriptName,
      projectDir,
      cloudflareEnv,
      applicationEnv,
    );
  }

  const applicationEnvBindingCount = await publishApplicationEnvBindings(
    scriptName,
    cloudflareEnv,
    applicationEnv,
  );

  return {
    scriptName,
    dispatchNamespace: cloudflareEnv.dispatchNamespace,
    framework,
    environment,
    applicationEnvBindingCount,
  };
}

// =============================================================================
// Route handler exports
// =============================================================================

export async function deploy(
  _state: AppState,
  body: Record<string, unknown>,
): Promise<ApiEnvelope<DeployResult>> {
  return ok(await runDeployPipeline(body));
}

export async function redeploy(
  _state: AppState,
  body: Record<string, unknown>,
): Promise<ApiEnvelope<DeployResult>> {
  return ok(await runDeployPipeline(body));
}

export async function deleteSite(
  _state: AppState,
  body: Record<string, unknown>,
): Promise<ApiEnvelope<DeleteResult>> {
  const { scriptName, cloudflareEnv } = parseDeleteBody(body);
  await deleteWorker(scriptName, cloudflareEnv);
  return ok({
    scriptName,
    dispatchNamespace: cloudflareEnv.dispatchNamespace,
    deleted: true,
  });
}
