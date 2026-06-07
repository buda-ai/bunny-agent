import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
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

/** Canonical Next.js artifact path (produced by opennextjs-cloudflare). */
const NEXTJS_ARTIFACT_PATH = ".open-next/worker.js" as const;
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
// Build helpers
// =============================================================================

/**
 * Runs `node build-worker.mjs` inside `projectDir` to generate the
 * self-contained Cloudflare Worker bundle (`dist/_worker.js`) from an
 * already-present Vite `dist/` output.
 *
 * Resolves when the script exits with code 0.
 * Throws AppError(500) on non-zero exit or spawn error.
 */
function runBuildWorker(projectDir: AbsolutePath): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = path.join(projectDir, "build-worker.mjs");
    const child = spawn("node", [script], {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      reject(new AppError(500, `failed to spawn build-worker.mjs: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const detail = (stderr || stdout).trim();
        reject(
          new AppError(
            500,
            `build-worker.mjs exited with code ${code}${detail ? ": " + detail : ""}`,
          ),
        );
      }
    });
  });
}

// =============================================================================
// Artifact location
// =============================================================================

/**
 * Probes the known Vite artifact candidate paths inside `projectDir`.
 * Returns the first match, or `undefined` if none are present.
 */
async function probeViteArtifacts(
  projectDir: AbsolutePath,
): Promise<ArtifactInfo | undefined> {
  for (const relativePath of VITE_ARTIFACT_CANDIDATES) {
    const absolutePath = path.join(projectDir, relativePath) as AbsolutePath;
    try {
      await fs.access(absolutePath);
      return {
        absolutePath,
        filename: path.basename(absolutePath),
        framework: "vite" as FrameworkType,
        relativePath,
      };
    } catch {
      // not present, try next candidate
    }
  }
  return undefined;
}

/**
 * Locates the pre-built worker artifact for the detected framework.
 *
 * Vite — probes in priority order:
 *   `.output/worker.js`  →  `dist/worker.js`  →  `dist/_worker.js`
 *
 * If no artifact is found on the first probe, automatically runs
 * `node build-worker.mjs` inside the project directory (which embeds the
 * Vite `dist/` static assets into a self-contained `dist/_worker.js`),
 * then re-probes. This covers the common case where `vite build` has been
 * run but `build-worker.mjs` has not yet been executed.
 *
 * Next.js — probes:
 *   `.open-next/worker.js`  (output of opennextjs-cloudflare)
 *
 * Returns a fully-typed `ArtifactInfo` including the canonical relative path.
 * Throws AppError(400) with actionable build instructions if no artifact found.
 */
export async function locateArtifact(
  projectDir: AbsolutePath,
  framework: FrameworkType,
): Promise<ArtifactInfo> {
  if (framework === "vite") {
    // Always regenerate the worker bundle on every deploy to ensure a fresh,
    // consistent artifact. Remove any stale worker files first.
    for (const relativePath of VITE_ARTIFACT_CANDIDATES) {
      const absolutePath = path.join(projectDir, relativePath) as AbsolutePath;
      try {
        await fs.unlink(absolutePath);
      } catch {
        // File didn't exist — nothing to remove.
      }
    }

    try {
      await runBuildWorker(projectDir);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        500,
        `build-worker.mjs failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const generated = await probeViteArtifacts(projectDir);
    if (generated) return generated;

    throw new AppError(
      400,
      "vite build output not found after running build-worker.mjs:" +
        " run 'vite build' first, then retry" +
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
      "opennextjs-cloudflare build output not found:" +
        " run 'npx opennextjs-cloudflare build' first (.open-next/worker.js)",
    );
  }
}

// =============================================================================
// Cloudflare SDK operations
// =============================================================================

/**
 * Collects all JS/MJS sibling modules in the same directory as the artifact.
 * These are uploaded alongside the main module so that relative imports
 * (e.g. `./cloudflare/images.js`) resolve correctly in the Workers runtime.
 *
 * Only files within the artifact's parent directory are collected; the main
 * artifact itself is excluded since it is passed separately as the main module.
 */
async function collectSiblingModules(
  artifact: ArtifactInfo,
): Promise<Array<{ content: Buffer; name: string }>> {
  const artifactDir = path.dirname(artifact.absolutePath);
  const modules: Array<{ content: Buffer; name: string }> = [];

  /** Directories that are not referenced by worker.js imports and can be skipped. */
  const SKIP_DIRS = new Set(["server-functions", "node_modules", "assets", "cache", "cloudflare-templates"]);

  async function walk(dir: string): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const fullPath = path.join(dir, name);
      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        await walk(fullPath);
      } else if (stat.isFile() && /\.(js|mjs)$/.test(name)) {
        if (fullPath === artifact.absolutePath) continue; // skip main module
        const relativeName = path.relative(artifactDir, fullPath);
        const content = await fs.readFile(fullPath);
        modules.push({ content, name: relativeName });
      }
    }
  }

  await walk(artifactDir);
  return modules;
}

/**
 * Uploads an artifact to the Cloudflare Workers for Platforms dispatch namespace.
 * Uses `scripts.update` which has upsert semantics (creates or overwrites).
 *
 * For Next.js builds produced by opennextjs-cloudflare, the worker.js contains
 * relative imports (e.g. `./cloudflare/images.js`) that must be uploaded as
 * additional ES modules alongside the main entry point. All sibling JS/MJS
 * files in the build output directory are collected and included in the upload.
 *
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

  const additionalFiles: Awaited<ReturnType<typeof toFile>>[] = [];

  if (artifact.framework === "nextjs") {
    const siblings = await collectSiblingModules(artifact);
    for (const sibling of siblings) {
      const mimeType = sibling.name.endsWith(".mjs")
        ? "application/javascript+module"
        : "application/javascript+module";
      additionalFiles.push(
        await toFile(sibling.content, sibling.name, { type: mimeType }),
      );
    }
  }

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
      files: [scriptFile, ...additionalFiles],
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
