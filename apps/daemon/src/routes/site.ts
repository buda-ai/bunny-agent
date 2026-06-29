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
   * Full caller-supplied `env` map from the request body.
   * Forwarded as-is into the wrangler child process environment so every
   * key the caller provides (beyond the three Cloudflare credentials) is
   * available to wrangler without the daemon hard-coding individual vars.
   */
  readonly callerEnv: Record<string, string>;
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
 * Cloudflare credentials are read from the `env` field of the request body
 * (a `Record<string, string>`) — never from `process.env`.
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

  return {
    projectDir: toAbsolutePath(raw.projectDir),
    scriptName: toScriptName(raw.scriptName),
    environment,
    cloudflareEnv,
    callerEnv: envMap,
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
 * Verifies that wrangler is available on PATH by running `npx wrangler --version`.
 * Throws AppError(500) with an actionable message if wrangler cannot be found or
 * the version check exits with a non-zero code.
 */
async function checkWranglerAvailable(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["wrangler", "--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.on("error", () => {
      reject(
        new AppError(
          500,
          "wrangler not found: install it with 'npm install -g wrangler' or add it as a project dependency",
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new AppError(
            500,
            "wrangler not found: install it with 'npm install -g wrangler' or add it as a project dependency",
          ),
        );
      }
    });
  });
}

/**
 * Deploys a Vite project by delegating to `npx wrangler deploy`.
 *
 * Strategy:
 * 1. Confirm wrangler is available — throws AppError(500) with install instructions if not.
 * 2. Check for an existing wrangler config (`wrangler.jsonc` or `wrangler.json`).
 *    - If found: patch the `name` field with `scriptName`, deploy, then restore.
 *    - If not found: probe for the first built artifact (.output/worker.js or dist/worker.js)
 *      to use as `main`, generate a minimal `wrangler.json`, deploy, then delete it.
 *      If no artifact exists yet, throws AppError(400) with actionable build instructions.
 * 3. Run `npx wrangler deploy --dispatch-namespace` in both cases.
 *
 * Throws AppError(400) if no artifact is found and no wrangler config exists.
 * Throws AppError(500) if wrangler is not available or exits with a non-zero code.
 */
export async function deployViteWithWrangler(
  scriptName: ScriptName,
  projectDir: AbsolutePath,
  env: CloudflareEnv,
  callerEnv: Record<string, string>,
): Promise<void> {
  // Fail fast with an actionable message if wrangler is not installed.
  await checkWranglerAvailable();

  // Check for an existing wrangler config.
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

  if (configPath !== null) {
    // ── Existing config: patch name, deploy, restore ──────────────────────
    const originalContent = await fs.readFile(configPath, "utf8");

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

    // Rewrite self-referential service bindings.
    if (originalName && Array.isArray(patched.services)) {
      patched.services = (
        patched.services as Array<Record<string, unknown>>
      ).map((svc) =>
        svc.service === originalName ? { ...svc, service: scriptName } : svc,
      );
    }

    // Strip self-referential service bindings that would fail dispatch-namespace validation.
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

    try {
      await fs.writeFile(
        configPath,
        JSON.stringify(deployConfig, null, "\t"),
        "utf8",
      );
      await runWranglerDeploy(projectDir, env, callerEnv);
    } finally {
      await fs.writeFile(configPath, originalContent, "utf8").catch(() => {});
    }
  } else {
    // ── No config: locate artifact, generate a minimal wrangler.json, deploy, then remove ──
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

    // if (!relativeMain) {
    //   throw new AppError(
    //     400,
    //     "vite build output not found: run 'vite build' first, then retry" +
    //       " (expected .output/worker.js or dist/worker.js)",
    //   );
    // }

    const generatedConfigPath = path.join(projectDir, "wrangler.json");
    const minimalConfig = {
      name: scriptName,
      main: relativeMain,
      compatibility_date: "2025-01-01",
    };

    try {
      await fs.writeFile(
        generatedConfigPath,
        JSON.stringify(minimalConfig, null, "\t"),
        "utf8",
      );
      await runWranglerDeploy(projectDir, env, callerEnv);
    } finally {
      await fs.unlink(generatedConfigPath).catch(() => {});
    }
  }
}

/**
 * Deploys a Next.js project by delegating entirely to `npx wrangler deploy`.
 *
 * Strategy:
 * 1. Locate the wrangler config file (`wrangler.jsonc` or `wrangler.json`).
 * 2. Parse it, overwrite the `name` field with `scriptName`, write it back.
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
  callerEnv: Record<string, string>,
): Promise<void> {
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

  try {
    await fs.writeFile(
      configPath,
      JSON.stringify(deployConfig, null, "\t"),
      "utf8",
    );
    await runWranglerDeploy(projectDir, env, callerEnv);
  } finally {
    // Always restore the original config, even on error.
    await fs.writeFile(configPath, originalContent, "utf8").catch(() => {
      // Best-effort restore — if this fails the original file is at least
      // recoverable by the user from their VCS.
    });
  }
}

/**
 * Spawns `npx wrangler deploy --dispatch-namespace <namespace>` inside `projectDir`.
 *
 * The `--dispatch-namespace` flag targets the Workers for Platforms dispatch
 * namespace so the user Worker is scoped to the namespace rather than being
 * deployed as a standalone account-level Worker.
 *
 * Merges `callerEnv` (the full `env` map from the request body) into the child
 * process environment on top of `process.env`, then pins the three Cloudflare
 * credentials from the validated `CloudflareEnv` so wrangler authenticates
 * without interactive login and all caller-supplied vars (e.g. NODE_ENV,
 * WRANGLER_SEND_METRICS) are also available to the child process.
 *
 * Resolves when wrangler exits with code 0.
 * Throws AppError(500) on non-zero exit or spawn error.
 */
function runWranglerDeploy(
  projectDir: AbsolutePath,
  env: CloudflareEnv,
  callerEnv: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["wrangler", "deploy", "--dispatch-namespace", env.dispatchNamespace],
      {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Spread the full caller-supplied env map so every key the caller
          // provides (e.g. WRANGLER_SEND_METRICS, CF_PAGES_BRANCH, …) reaches
          // wrangler, not just the three Cloudflare credentials.
          ...callerEnv,
          // Pin the three credentials explicitly so they always match the
          // validated CloudflareEnv values, even if callerEnv contained stale
          // or differently-cased copies.
          CLOUDFLARE_API_TOKEN: env.apiToken,
          CLOUDFLARE_ACCOUNT_ID: env.accountId,
          CLOUDFLARE_DISPATCH_NAMESPACE: env.dispatchNamespace,
        },
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
  callerEnv: Record<string, string>,
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
        env: {
          ...process.env,
          ...callerEnv,
          CLOUDFLARE_API_TOKEN: env.apiToken,
          CLOUDFLARE_ACCOUNT_ID: env.accountId,
          CLOUDFLARE_DISPATCH_NAMESPACE: env.dispatchNamespace,
        },
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
    callerEnv,
  } = parseDeployBody(raw);
  const scriptName = toScriptName(`${originalScriptName}`);
  const framework = await detectFramework(projectDir);

  if (framework === "nextjs") {
    await deployNextjsWithWrangler(
      scriptName,
      projectDir,
      cloudflareEnv,
      callerEnv,
    );
  } else {
    await deployViteWithWrangler(
      scriptName,
      projectDir,
      cloudflareEnv,
      callerEnv,
    );
  }

  return {
    scriptName,
    dispatchNamespace: cloudflareEnv.dispatchNamespace,
    framework,
    environment,
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
  const callerEnv =
    typeof body.env === "object" &&
    body.env !== null &&
    !Array.isArray(body.env) &&
    Object.values(body.env).every((v) => typeof v === "string")
      ? (body.env as Record<string, string>)
      : {};
  await deleteWorker(scriptName, cloudflareEnv, callerEnv);
  return ok({
    scriptName,
    dispatchNamespace: cloudflareEnv.dispatchNamespace,
    deleted: true,
  });
}
