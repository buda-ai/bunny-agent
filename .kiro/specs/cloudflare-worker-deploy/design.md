# Design Document: cloudflare-worker-deploy

## Overview

This feature adds three REST endpoints to the bunny-agent daemon that enable deploying, redeploying, and deleting Cloudflare Workers for user project directories. The implementation lives entirely in two files:

- `apps/daemon/src/routes/site.ts` — new route handler module
- `apps/daemon/src/router.ts` — three new route registrations

The daemon never builds projects. It detects the framework by config file presence, locates an existing build artifact, then uploads it to a Cloudflare Workers for Platforms dispatch namespace via the official `cloudflare` Node.js SDK.

## Architecture

```
HTTP Request
     │
     ▼
DaemonRouter (router.ts)
     │  routes: POST /api/site/deploy
     │          POST /api/site/redeploy
     │          POST /api/site/delete
     │
     ▼
site.ts
  ├── validateEnv()          — checks 3 required env vars, throws AppError(500)
  ├── validateDeployBody()   — checks projectDir + scriptName, throws AppError(400)
  ├── validateScriptName()   — alphanumeric/hyphen/underscore, max 64 chars
  ├── detectFramework()      — file-existence check, returns "vite" | "nextjs"
  ├── locateArtifact()       — returns absolute path to built worker JS file
  ├── uploadWorker()         — Cloudflare SDK call to create/overwrite script
  ├── deleteWorker()         — Cloudflare SDK call to remove script
  │
  └── exports: deploy(), redeploy(), deleteSite()
```

## Data Models

### Request bodies

```typescript
// POST /api/site/deploy and /api/site/redeploy
interface DeployBody {
  projectDir: string;   // absolute path to the user's project, e.g. /Users/rang/workspace/vite-project
  scriptName: string;   // worker name in the dispatch namespace, e.g. "user-vite-app"
}

// POST /api/site/delete
interface DeleteBody {
  scriptName: string;
}
```

### Success response data shapes

```typescript
// deploy / redeploy success
interface DeployResult {
  scriptName: string;
  dispatchNamespace: string;
  framework: "vite" | "nextjs";
}

// delete success
interface DeleteResult {
  scriptName: string;
  dispatchNamespace: string;
  deleted: true;
}
```

### Internal types

```typescript
type FrameworkType = "vite" | "nextjs";

interface ArtifactInfo {
  absolutePath: string;   // e.g. /Users/rang/workspace/vite-project/dist/worker.js
  filename: string;       // basename, e.g. "worker.js" — used as main_module
}
```

## Component Design

### `validateEnv()`

Reads the three required environment variables and throws `AppError(500)` for any that are missing or empty. Called at the start of every handler so startup is not gated on env vars.

```typescript
function validateEnv(): { apiToken: string; accountId: string; dispatchNamespace: string }
```

### `validateDeployBody(body: unknown)`

Validates `projectDir` (non-empty string) and `scriptName` (non-empty, max 64 chars, `/^[A-Za-z0-9_-]+$/`). Throws `AppError(400)` on any failure.

### `detectFramework(projectDir: string): FrameworkType`

Checks file existence in order:
1. `vite.config.ts` or `vite.config.js` → `"vite"` (checked first; Vite wins on conflict)
2. `next.config.js`, `next.config.mjs`, or `next.config.ts` → `"nextjs"`
3. Neither found → throws `AppError(400, "unsupported framework: no vite.config or next.config found")`
4. Directory not accessible → throws `AppError(400, "project directory not found: <path>")`

Uses `fs.access()` to check directory existence before any config file checks.

### `locateArtifact(projectDir: string, framework: FrameworkType): Promise<ArtifactInfo>`

**Vite** — checks in priority order:
1. `<projectDir>/.output/worker.js`
2. `<projectDir>/dist/worker.js`
3. `<projectDir>/dist/_worker.js`

Returns the first that exists. If none found, throws `AppError(400, "vite build output not found: run your build first (expected .output/worker.js, dist/worker.js, or dist/_worker.js)")`.

**Next.js** — checks:
1. `<projectDir>/.vercel/output/static/_worker.js`

If not found, throws `AppError(400, "next-on-pages build output not found: run 'npx @cloudflare/next-on-pages' first (.vercel/output/static/_worker.js)")`.

### `uploadWorker(scriptName, artifact, env): Promise<void>`

Constructs a `Cloudflare` client instance with `apiToken`. Reads the artifact file as a `Buffer`. Calls:

```typescript
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
```

Cloudflare SDK errors are allowed to propagate. The router catches them as generic errors and returns HTTP 500.

### `deleteWorker(scriptName, env): Promise<void>`

```typescript
const client = new Cloudflare({ apiToken: env.apiToken });
await client.workersForPlatforms.dispatch.namespaces.scripts.delete(
  env.dispatchNamespace,
  scriptName,
  { account_id: env.accountId },
);
```

For 404 errors from the SDK, the handler detects them by checking `err.status === 404` (the `cloudflare` SDK throws `APIError` objects with a `status` field) and throws `AppError(404, "worker not found: <scriptName>")`. All other SDK errors become `AppError(500, ...)`.

## Deploy / Redeploy Pipeline

Both `deploy()` and `redeploy()` run the same pipeline — the Cloudflare `update` API is idempotent (upsert):

```
validateEnv()
  → validateDeployBody(body)
  → detectFramework(projectDir)
  → locateArtifact(projectDir, framework)
  → uploadWorker(scriptName, artifact, env)
  → return ok({ scriptName, dispatchNamespace, framework })
```

This means `/api/site/deploy` and `/api/site/redeploy` share a single internal `runDeployPipeline()` helper. The two exported functions just call that helper.

## Delete Pipeline

```
validateEnv()
  → validate scriptName present and non-empty
  → deleteWorker(scriptName, env)
  → return ok({ scriptName, dispatchNamespace, deleted: true })
```

## Error Mapping

| Condition | AppError status | Message |
|---|---|---|
| Missing env var | 500 | `"missing required env var: <NAME>"` |
| projectDir missing/empty | 400 | `"projectDir is required"` |
| scriptName missing/empty | 400 | `"scriptName is required"` |
| scriptName invalid chars | 400 | `"scriptName must contain only alphanumeric characters, hyphens, and underscores"` |
| scriptName too long | 400 | `"scriptName must be 64 characters or fewer"` |
| projectDir not found | 400 | `"project directory not found: <path>"` |
| Unsupported framework | 400 | `"unsupported framework: no vite.config or next.config found"` |
| Vite artifact missing | 400 | `"vite build output not found: run your build first (expected .output/worker.js, dist/worker.js, or dist/_worker.js)"` |
| Next artifact missing | 400 | `"next-on-pages build output not found: run 'npx @cloudflare/next-on-pages' first (.vercel/output/static/_worker.js)"` |
| Worker not found (delete) | 404 | `"worker not found: <scriptName>"` |
| Cloudflare SDK error | 500 | Cloudflare error message |

The DaemonRouter already maps `AppError.status` to the HTTP response status. No changes to the router error handling are needed.

## Cloudflare SDK Initialization

A new `Cloudflare` client instance is created per request inside `uploadWorker()` and `deleteWorker()`. This avoids stale token issues if env vars change and is low cost since the SDK client is stateless. There is no singleton.

## Changes to `router.ts`

Two additions:

```typescript
// Top of file — new import
import * as siteRoutes from "./routes/site.js";

// In constructor routes array — three new entries
["POST", "/api/site/deploy",   (s, b) => siteRoutes.deploy(s, b)],
["POST", "/api/site/redeploy", (s, b) => siteRoutes.redeploy(s, b)],
["POST", "/api/site/delete",   (s, b) => siteRoutes.deleteSite(s, b)],
```

`AppState` is passed to handlers as usual but is not used by site routes (framework detection and artifact location operate directly on the absolute `projectDir` provided in the request body, not on the daemon's workspace root).

## Dependency Addition

The `cloudflare` npm package must be added to `apps/daemon/package.json`:

```bash
pnpm --filter @bunny-agent/daemon add cloudflare
```

This adds it as a runtime dependency. The `toFile` helper is exported from the top-level `cloudflare` package.

## File Structure

Only two files change:

```
apps/daemon/src/
  routes/
    site.ts          ← new (currently empty)
  router.ts          ← add import + 3 route registrations
```

## `site.ts` Exported Interface

```typescript
export async function deploy(
  state: AppState,
  body: unknown,
): Promise<ApiEnvelope>

export async function redeploy(
  state: AppState,
  body: unknown,
): Promise<ApiEnvelope>

export async function deleteSite(
  state: AppState,
  body: unknown,
): Promise<ApiEnvelope>
```

All three conform to the `RouteHandler` signature expected by `DaemonRouter`.

## Environment Variable Reference

| Variable | Required by | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | deploy, redeploy, delete | Already in `.env.example` |
| `CLOUDFLARE_ACCOUNT_ID` | deploy, redeploy, delete | Already in `.env.example` |
| `CLOUDFLARE_DISPATCH_NAMESPACE` | deploy, redeploy, delete | **Must be added to `.env.example`** |

## Components and Interfaces

### `site.ts` Internal Functions

```typescript
/** Reads and validates the three required Cloudflare env vars. Throws AppError(500) if any are missing. */
function validateEnv(): { apiToken: string; accountId: string; dispatchNamespace: string }

/** Validates projectDir and scriptName from raw request body. Throws AppError(400) on any failure. */
function validateDeployBody(body: unknown): { projectDir: string; scriptName: string }

/** Validates scriptName format (alphanumeric/hyphen/underscore, max 64 chars). Throws AppError(400) on failure. */
function validateScriptName(scriptName: string): void

/** Checks project directory and config files to determine framework. Throws AppError(400) on unknown framework or missing dir. */
async function detectFramework(projectDir: string): Promise<FrameworkType>

/** Locates the first valid build artifact on disk for the detected framework. Throws AppError(400) if not found. */
async function locateArtifact(projectDir: string, framework: FrameworkType): Promise<ArtifactInfo>

/** Reads artifact and uploads to Cloudflare dispatch namespace via SDK. Throws on SDK error. */
async function uploadWorker(
  scriptName: string,
  artifact: ArtifactInfo,
  env: { apiToken: string; accountId: string; dispatchNamespace: string },
): Promise<void>

/** Deletes a named worker from the dispatch namespace. Maps SDK 404 → AppError(404), others → AppError(500). */
async function deleteWorker(
  scriptName: string,
  env: { apiToken: string; accountId: string; dispatchNamespace: string },
): Promise<void>

/** Shared deploy/redeploy pipeline. */
async function runDeployPipeline(body: unknown): Promise<DeployResult>
```

### `site.ts` Exported Route Handlers

```typescript
export async function deploy(state: AppState, body: unknown): Promise<ApiEnvelope>
export async function redeploy(state: AppState, body: unknown): Promise<ApiEnvelope>
export async function deleteSite(state: AppState, body: unknown): Promise<ApiEnvelope>
```

### Internal Types

```typescript
type FrameworkType = "vite" | "nextjs";

interface ArtifactInfo {
  absolutePath: string; // full path, e.g. /workspace/vite-project/dist/worker.js
  filename: string;     // basename used as main_module, e.g. "worker.js"
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
```

### `router.ts` Changes

```typescript
// New import added at top
import * as siteRoutes from "./routes/site.js";

// Three new entries in the routes array inside the constructor
["POST", "/api/site/deploy",   (s, b) => siteRoutes.deploy(s, b)],
["POST", "/api/site/redeploy", (s, b) => siteRoutes.redeploy(s, b)],
["POST", "/api/site/delete",   (s, b) => siteRoutes.deleteSite(s, b)],
```

## Error Handling

All errors in `site.ts` are expressed as `AppError(status, message)`. The existing `DaemonRouter.handle()` already catches `AppError` and maps its `status` field to the HTTP response code, and all other thrown errors to HTTP 500.

| Condition | `AppError` status | Response message |
|---|---|---|
| Missing env var | 500 | `"missing required env var: <NAME>"` |
| `projectDir` missing/empty/whitespace | 400 | `"projectDir is required"` |
| `scriptName` missing/empty/whitespace | 400 | `"scriptName is required"` |
| `scriptName` invalid characters | 400 | `"scriptName must contain only alphanumeric characters, hyphens, and underscores"` |
| `scriptName` exceeds 64 chars | 400 | `"scriptName must be 64 characters or fewer"` |
| Project directory not found | 400 | `"project directory not found: <path>"` |
| Unsupported framework | 400 | `"unsupported framework: no vite.config or next.config found"` |
| Vite artifact not found | 400 | `"vite build output not found: run your build first (expected .output/worker.js, dist/worker.js, or dist/_worker.js)"` |
| Next.js artifact not found | 400 | `"next-on-pages build output not found: run 'npx @cloudflare/next-on-pages' first (.vercel/output/static/_worker.js)"` |
| Worker not found on delete | 404 | `"worker not found: <scriptName>"` |
| Cloudflare SDK error (non-404) | 500 | SDK error message |

`deleteWorker` detects 404 by checking `(err as any).status === 404` on the `APIError` thrown by the `cloudflare` SDK. All other SDK errors propagate and are caught by the router as generic 500s.

## Correctness Properties

These properties are expressed as property-based tests using `fast-check` (already a devDependency) in `apps/daemon/src/__tests__/site.test.ts`.

### Property 1: scriptName validation is total and consistent

**Validates: Requirements 5.4, 5.5, 5.6**

For any string `s`:
- If `s` matches `/^[A-Za-z0-9_-]{1,64}$/`, then `validateScriptName(s)` must not throw.
- If `s` does not match that pattern (wrong chars, empty, or length > 64), `validateScriptName(s)` must throw `AppError(400)`.

```
∀ s: string →
  (/^[A-Za-z0-9_-]{1,64}$/.test(s) ⟺ validateScriptName(s) does not throw)
```

### Property 2: Framework detection is deterministic and exhaustive

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

For any combination of Vite config files present/absent and Next.js config files present/absent:
- Vite present (regardless of Next.js) → result is `"vite"`
- Vite absent, Next.js present → result is `"nextjs"`
- Both absent → throws `AppError(400)`

```
∀ (hasVite: boolean, hasNext: boolean) →
  hasVite                     ⟹ detectFramework() === "vite"
  !hasVite && hasNext         ⟹ detectFramework() === "nextjs"
  !hasVite && !hasNext        ⟹ detectFramework() throws AppError(400)
```

### Property 3: Artifact location priority is stable

**Validates: Requirements 2.1, 2.3, 3.1, 3.2**

For Vite projects, if multiple candidate paths exist simultaneously, the result must always be the highest-priority existing path:

```
∀ (hasOutput: boolean, hasDist: boolean, hasDistUnderscore: boolean) →
  hasOutput           ⟹ locateArtifact() returns ".output/worker.js"
  !hasOutput && hasDist ⟹ locateArtifact() returns "dist/worker.js"
  !hasOutput && !hasDist && hasDistUnderscore ⟹ locateArtifact() returns "dist/_worker.js"
  none                ⟹ locateArtifact() throws AppError(400)
```

### Property 4: Deploy pipeline atomicity

**Validates: Requirements 5.2, 5.7, 6.3, 6.5**

If any step in the pipeline fails, the handler returns `ok: false` and does not proceed to subsequent steps. If all steps succeed, `ok: true` is returned with all three fields (`scriptName`, `dispatchNamespace`, `framework`) present and non-empty.

## Testing Strategy

Unit tests live in `apps/daemon/src/__tests__/site.test.ts`.

**Validation tests** — table-driven: empty strings, whitespace-only, invalid characters, too-long scriptName.

**Framework detection tests** — cover: vite-only, next-only, both present (vite wins), neither, directory missing.

**Artifact location tests** — mock `fs.access` to simulate each candidate present/absent in all combinations.

**Deploy pipeline integration test** — mock the Cloudflare SDK; verify the `update` call receives correct namespace, scriptName, account_id, main_module, and files.

**Delete pipeline test** — mock SDK; verify correct `delete` call parameters; verify 404 SDK error maps to `AppError(404)`.

**Property-based tests** — `fast-check` generators for the four correctness properties above.
