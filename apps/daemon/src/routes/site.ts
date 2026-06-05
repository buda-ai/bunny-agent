import * as fs from "node:fs/promises";
import * as path from "node:path";
import Cloudflare, { toFile } from "cloudflare";
import type { AppState, ApiEnvelope } from "../utils.js";
import { AppError, ok } from "../utils.js";

// ---------------------------------------------------------------------------
// Internal type definitions
// ---------------------------------------------------------------------------

type FrameworkType = "vite" | "nextjs";

interface ArtifactInfo {
  absolutePath: string; // full path, e.g. /workspace/vite-project/dist/worker.js
  filename: string; // basename used as main_module, e.g. "worker.js"
}

interface DeployResult {
  scriptName: string;
  dispatchNamespace: string;
  framework: FrameworkType;
}

interface DeleteResult {
  scriptName: string;
  dispatchNamespace: string;
  deleted: true;
}

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

/**
 * Reads and validates the three required Cloudflare env vars.
 * Throws AppError(500) if any are missing or empty.
 */
export function validateEnv(): {
  apiToken: string;
  accountId: string;
  dispatchNamespace: string;
} {
  const vars = [
    ["CLOUDFLARE_API_TOKEN", "apiToken"],
    ["CLOUDFLARE_ACCOUNT_ID", "accountId"],
    ["CLOUDFLARE_DISPATCH_NAMESPACE", "dispatchNamespace"],
  ] as const;

  const result: Record<string, string> = {};

  for (const [name, key] of vars) {
    const value = process.env[name];
    if (!value) {
      throw new AppError(500, `missing required env var: ${name}`);
    }
    result[key] = value;
  }

  return result as { apiToken: string; accountId: string; dispatchNamespace: string };
}

// ---------------------------------------------------------------------------
// Script name and deploy body validation
// ---------------------------------------------------------------------------

/**
 * Validates a Cloudflare Worker script name.
 * Throws AppError(400) if empty/whitespace, exceeds 64 chars, or contains
 * characters outside [A-Za-z0-9_-].
 */
export function validateScriptName(scriptName: string): void {
  if (!scriptName || scriptName.trim().length === 0) {
    throw new AppError(400, "scriptName is required");
  }
  if (scriptName.length > 64) {
    throw new AppError(400, "scriptName must be 64 characters or fewer");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(scriptName)) {
    throw new AppError(
      400,
      "scriptName must contain only alphanumeric characters, hyphens, and underscores",
    );
  }
}

/**
 * Extracts and validates `projectDir` and `scriptName` from an unknown request body.
 * Throws AppError(400) on any validation failure.
 * Returns the validated fields as typed strings.
 */
export function validateDeployBody(body: unknown): { projectDir: string; scriptName: string } {
  const b = body as Record<string, unknown> | null | undefined;

  const projectDir = b?.projectDir;
  if (!projectDir || typeof projectDir !== "string" || projectDir.trim().length === 0) {
    throw new AppError(400, "projectDir is required");
  }

  const scriptName = b?.scriptName;
  if (!scriptName || typeof scriptName !== "string" || scriptName.trim().length === 0) {
    throw new AppError(400, "scriptName is required");
  }

  validateScriptName(scriptName);

  return { projectDir, scriptName };
}

// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------

/**
 * Detects the framework used in the given project directory by checking for
 * well-known config files. Vite is checked first and wins if both are present.
 *
 * Throws AppError(400) if the directory is missing/inaccessible or if no
 * supported framework config is found.
 */
export async function detectFramework(projectDir: string): Promise<FrameworkType> {
  // Verify the directory is accessible
  try {
    await fs.access(projectDir);
  } catch {
    throw new AppError(400, `project directory not found: ${projectDir}`);
  }

  // Check for Vite config (ts first, then js)
  for (const viteConfig of ["vite.config.ts", "vite.config.js"]) {
    try {
      await fs.access(path.join(projectDir, viteConfig));
      return "vite";
    } catch {
      // not found, try next
    }
  }

  // Check for Next.js config
  for (const nextConfig of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
    try {
      await fs.access(path.join(projectDir, nextConfig));
      return "nextjs";
    } catch {
      // not found, try next
    }
  }

  throw new AppError(400, "unsupported framework: no vite.config or next.config found");
}

// ---------------------------------------------------------------------------
// Artifact location
// ---------------------------------------------------------------------------

/**
 * Locates the built worker artifact for the given framework.
 *
 * For "vite": checks .output/worker.js, dist/worker.js, dist/_worker.js in
 * priority order and returns the first that exists.
 *
 * For "nextjs": checks .vercel/output/static/_worker.js.
 *
 * Throws AppError(400) if no artifact is found.
 */
export async function locateArtifact(projectDir: string, framework: FrameworkType): Promise<ArtifactInfo> {
  if (framework === "vite") {
    const candidates = [
      ".output/worker.js",
      "dist/worker.js",
      "dist/_worker.js",
    ];

    for (const relative of candidates) {
      const absolutePath = path.join(projectDir, relative);
      try {
        await fs.access(absolutePath);
        return { absolutePath, filename: path.basename(absolutePath) };
      } catch {
        // not found, try next candidate
      }
    }

    throw new AppError(
      400,
      "vite build output not found: run your build first (expected .output/worker.js, dist/worker.js, or dist/_worker.js)",
    );
  }

  // framework === "nextjs"
  const absolutePath = path.join(projectDir, ".vercel/output/static/_worker.js");
  try {
    await fs.access(absolutePath);
    return { absolutePath, filename: "_worker.js" };
  } catch {
    throw new AppError(
      400,
      "next-on-pages build output not found: run 'npx @cloudflare/next-on-pages' first (.vercel/output/static/_worker.js)",
    );
  }
}

// ---------------------------------------------------------------------------
// Cloudflare SDK operations
// ---------------------------------------------------------------------------

/**
 * Reads the artifact file and uploads it to Cloudflare Workers for Platforms
 * via the SDK's `scripts.update` call (upsert semantics — create or overwrite).
 * SDK errors are intentionally not caught here; the router maps them to HTTP 500.
 */
export async function uploadWorker(
  scriptName: string,
  artifact: ArtifactInfo,
  env: { apiToken: string; accountId: string; dispatchNamespace: string },
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
 * Maps SDK 404 errors to AppError(404); all other SDK errors become AppError(500).
 */
export async function deleteWorker(
  scriptName: string,
  env: { apiToken: string; accountId: string; dispatchNamespace: string },
): Promise<void> {
  const client = new Cloudflare({ apiToken: env.apiToken });
  try {
    await client.workersForPlatforms.dispatch.namespaces.scripts.delete(
      env.dispatchNamespace,
      scriptName,
      { account_id: env.accountId },
    );
  } catch (err) {
    if ((err as any).status === 404) {
      throw new AppError(404, `worker not found: ${scriptName}`);
    }
    throw new AppError(500, err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Deploy pipeline
// ---------------------------------------------------------------------------

/**
 * Shared deploy/redeploy pipeline. Validates inputs, detects the framework,
 * locates the build artifact, and uploads the worker to Cloudflare.
 */
export async function runDeployPipeline(body: unknown): Promise<DeployResult> {
  const env = validateEnv();
  const { projectDir, scriptName } = validateDeployBody(body);
  const framework = await detectFramework(projectDir);
  const artifact = await locateArtifact(projectDir, framework);
  await uploadWorker(scriptName, artifact, env);
  return { scriptName, dispatchNamespace: env.dispatchNamespace, framework };
}

// ---------------------------------------------------------------------------
// Route handler exports
// ---------------------------------------------------------------------------

export async function deploy(
  _state: AppState,
  body: unknown,
): Promise<ApiEnvelope> {
  return ok(await runDeployPipeline(body));
}

export async function redeploy(
  _state: AppState,
  body: unknown,
): Promise<ApiEnvelope> {
  return ok(await runDeployPipeline(body));
}

export async function deleteSite(
  _state: AppState,
  body: unknown,
): Promise<ApiEnvelope> {
  const env = validateEnv();
  const b = body as Record<string, unknown> | null | undefined;
  const scriptName = b?.scriptName;
  if (!scriptName || typeof scriptName !== "string" || scriptName.trim().length === 0) {
    throw new AppError(400, "scriptName is required");
  }
  await deleteWorker(scriptName, env);
  return ok({ scriptName, dispatchNamespace: env.dispatchNamespace, deleted: true as const });
}
