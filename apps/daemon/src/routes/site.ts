import * as fs from "node:fs/promises";
import * as path from "node:path";
import Cloudflare, { toFile } from "cloudflare";
import type { AppState, ApiEnvelope } from "../utils.js";
import { AppError, ok } from "../utils.js";

// =============================================================================
// Branded primitive types
// =============================================================================

/**
 * A non-empty absolute filesystem path string.
 * Branding prevents accidental use of unvalidated strings as directory paths.
 */
type AbsolutePath = string & { readonly __brand: "AbsolutePath" };

/**
 * A validated Cloudflare Worker script name:
 * 1–64 chars, only [A-Za-z0-9_-].
 */
type ScriptName = string & { readonly __brand: "ScriptName" };

// =============================================================================
// Domain enums and constants
// =============================================================================

/** Supported project frameworks. */
export type FrameworkType = "vite" | "nextjs";

/** Ordered candidate paths for Vite build artifacts (highest priority first). */
const VITE_ARTIFACT_CANDIDATES = [
  ".output/worker.js",
  "dist/worker.js",
  "dist/_worker.js",
] as const;

type ViteArtifactPath = (typeof VITE_ARTIFACT_CANDIDATES)[number];

/** Canonical Next.js artifact path (produced by @cloudflare/next-on-pages). */
const NEXTJS_ARTIFACT_PATH = ".vercel/output/static/_worker.js" as const;
type NextjsArtifactPath = typeof NEXTJS_ARTIFACT_PATH;

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

/** Parsed, validated body for POST /api/site/deploy and /api/site/redeploy. */
export interface DeployBody {
  /** Absolute path to the user's project directory on the local filesystem. */
  readonly projectDir: AbsolutePath;
  /** Validated Cloudflare Worker script name (identifier in dispatch namespace). */
  readonly scriptName: ScriptName;
}

/** Parsed, validated body for POST /api/site/delete. */
export interface DeleteBody {
  /** Validated Cloudflare Worker script name to delete. */
  readonly scriptName: ScriptName;
}

/** Success payload returned by POST /api/site/deploy and /api/site/redeploy. */
export interface DeployResult {
  readonly scriptName: ScriptName;
  readonly dispatchNamespace: string;
  readonly framework: FrameworkType;
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

/** Resolved Cloudflare credentials read from environment variables. */
interface CloudflareEnv {
  readonly apiToken: string;
  readonly accountId: string;
  readonly dispatchNamespace: string;
}

/** A located build artifact file that is ready for upload. */
interface ArtifactInfo {
  /** Absolute path to the built worker JS file on disk. */
  readonly absolutePath: AbsolutePath;
  /**
   * Basename of the file, used as the `main_module` specifier in the
   * Cloudflare Workers metadata (e.g. "worker.js" or "_worker.js").
   */
  readonly filename: string;
  /** Framework that produced this artifact. */
  readonly framework: FrameworkType;
  /** Relative artifact path within the project directory (for diagnostics). */
  readonly relativePath: ViteArtifactPath | NextjsArtifactPath;
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
 * Reads and validates the three required Cloudflare environment variables.
 * All three are checked up-front — before any SDK call — so missing config
 * surfaces as a clear 500 rather than an opaque SDK authentication failure.
 * Throws AppError(500) for any missing or empty variable.
 */
export function validateEnv(): CloudflareEnv {
  const entries = [
    ["CLOUDFLARE_API_TOKEN", "apiToken"],
    ["CLOUDFLARE_ACCOUNT_ID", "accountId"],
    ["CLOUDFLARE_DISPATCH_NAMESPACE", "dispatchNamespace"],
  ] as const satisfies ReadonlyArray<
    readonly [keyof NodeJS.ProcessEnv, keyof CloudflareEnv]
  >;

  const result = {} as Record<keyof CloudflareEnv, string>;

  for (const [envVar, field] of entries) {
    const value = process.env[envVar];
    if (!value) {
      throw new AppError(500, `missing required env var: ${envVar}`);
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

  return {
    projectDir: toAbsolutePath(raw.projectDir),
    scriptName: toScriptName(raw.scriptName),
  };
}

/**
 * Parses and validates a delete request body.
 * Returns a strongly-typed `DeleteBody` with a branded `scriptName` on success.
 * Throws AppError(400) on any validation failure.
 */
export function parseDeleteBody(raw: unknown): DeleteBody {
  if (!isPlainObject(raw)) {
    throw new AppError(400, "request body must be a JSON object");
  }

  if (!isNonEmptyString(raw.scriptName)) {
    throw new AppError(400, "scriptName is required");
  }

  return { scriptName: toScriptName(raw.scriptName) };
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
export async function detectFramework(projectDir: AbsolutePath): Promise<FrameworkType> {
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

  throw new AppError(400, "unsupported framework: no vite.config or next.config found");
}

// =============================================================================
// Artifact location
// =============================================================================

/**
 * Locates the pre-built worker artifact for the detected framework.
 *
 * Vite — probes in priority order:
 *   `.output/worker.js`  →  `dist/worker.js`  →  `dist/_worker.js`
 *
 * Next.js — probes:
 *   `.vercel/output/static/_worker.js`  (output of @cloudflare/next-on-pages)
 *
 * Returns a fully-typed `ArtifactInfo` including the canonical relative path.
 * Throws AppError(400) with actionable build instructions if no artifact found.
 */
export async function locateArtifact(
  projectDir: AbsolutePath,
  framework: FrameworkType,
): Promise<ArtifactInfo> {
  if (framework === "vite") {
    for (const relativePath of VITE_ARTIFACT_CANDIDATES) {
      const absolutePath = path.join(projectDir, relativePath) as AbsolutePath;
      try {
        await fs.access(absolutePath);
        return {
          absolutePath,
          filename: path.basename(absolutePath),
          framework,
          relativePath,
        };
      } catch {
        // not present, try next candidate
      }
    }
    throw new AppError(
      400,
      "vite build output not found: run your build first" +
        " (expected .output/worker.js, dist/worker.js, or dist/_worker.js)",
    );
  }

  // framework === "nextjs"
  const relativePath = NEXTJS_ARTIFACT_PATH;
  const absolutePath = path.join(projectDir, relativePath) as AbsolutePath;
  try {
    await fs.access(absolutePath);
    return {
      absolutePath,
      filename: path.basename(absolutePath),
      framework,
      relativePath,
    };
  } catch {
    throw new AppError(
      400,
      "next-on-pages build output not found:" +
        " run 'npx @cloudflare/next-on-pages' first (.vercel/output/static/_worker.js)",
    );
  }
}

// =============================================================================
// Cloudflare SDK operations
// =============================================================================

/**
 * Uploads an artifact to the Cloudflare Workers for Platforms dispatch namespace.
 * Uses `scripts.update` which has upsert semantics (creates or overwrites).
 * SDK errors propagate uncaught — the DaemonRouter maps them to HTTP 500.
 */
export async function uploadWorker(
  scriptName: ScriptName,
  artifact: ArtifactInfo,
  env: CloudflareEnv,
): Promise<void> {
  const client = new Cloudflare({ apiToken: env.apiToken });
  const fileContent = await fs.readFile(artifact.absolutePath);
  const scriptFile = await toFile(fileContent, artifact.filename, {
    type: "application/javascript+module",
  });
  await client.workersForPlatforms.dispatch.namespaces.scripts.update(
    env.dispatchNamespace,
    scriptName,
    {
      account_id: env.accountId,
      metadata: {
        main_module: artifact.filename,
        compatibility_date: "2025-01-01",
        bindings: [],
      },
      files: [scriptFile],
    },
  );
}

/**
 * Deletes a named worker from the dispatch namespace.
 * Maps SDK 404 → AppError(404); all other SDK errors → AppError(500).
 */
export async function deleteWorker(
  scriptName: ScriptName,
  env: CloudflareEnv,
): Promise<void> {
  const client = new Cloudflare({ apiToken: env.apiToken });
  try {
    await client.workersForPlatforms.dispatch.namespaces.scripts.delete(
      env.dispatchNamespace,
      scriptName,
      { account_id: env.accountId },
    );
  } catch (err) {
    // The Cloudflare SDK throws APIError objects that carry an HTTP status code.
    if (typeof err === "object" && err !== null && (err as { status?: unknown }).status === 404) {
      throw new AppError(404, `worker not found: ${scriptName}`);
    }
    throw new AppError(500, err instanceof Error ? err.message : String(err));
  }
}

// =============================================================================
// Deploy pipeline
// =============================================================================

/**
 * Shared pipeline for deploy and redeploy:
 *   validateEnv → parseDeployBody → detectFramework → locateArtifact → uploadWorker
 *
 * Each step returns a fully-typed value consumed by the next step.
 * Any step failure throws an AppError with the appropriate HTTP status.
 */
export async function runDeployPipeline(raw: unknown): Promise<DeployResult> {
  const env = validateEnv();
  const { projectDir, scriptName } = parseDeployBody(raw);
  const framework = await detectFramework(projectDir);
  const artifact = await locateArtifact(projectDir, framework);
  await uploadWorker(scriptName, artifact, env);
  return {
    scriptName,
    dispatchNamespace: env.dispatchNamespace,
    framework,
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
  const env = validateEnv();
  const { scriptName } = parseDeleteBody(body);
  await deleteWorker(scriptName, env);
  return ok({
    scriptName,
    dispatchNamespace: env.dispatchNamespace,
    deleted: true,
  });
}
