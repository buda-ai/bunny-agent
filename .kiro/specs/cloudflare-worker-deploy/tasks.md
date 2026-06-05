# Implementation Plan: cloudflare-worker-deploy

## Overview

Implement three REST API endpoints (`POST /api/site/deploy`, `POST /api/site/redeploy`, `POST /api/site/delete`) in the bunny-agent daemon. The work spans: adding the `cloudflare` npm dependency, implementing `apps/daemon/src/routes/site.ts` with framework detection, artifact location, and Cloudflare Workers for Platforms upload/delete logic, registering the new routes in `DaemonRouter`, writing unit and property-based tests, and documenting the new `CLOUDFLARE_DISPATCH_NAMESPACE` environment variable.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "description": "Add cloudflare npm dependency"
    },
    {
      "wave": 2,
      "tasks": ["2"],
      "description": "Implement site.ts route handler"
    },
    {
      "wave": 3,
      "tasks": ["3", "4", "5"],
      "description": "Register routes, write tests, update env docs (parallelizable)"
    }
  ]
}
```

## Tasks

- [x] 1. Add `cloudflare` npm dependency to daemon package
  - Run `pnpm --filter @bunny-agent/daemon add cloudflare` to install the official Cloudflare SDK
  - Verify `cloudflare` appears in the `dependencies` field of `apps/daemon/package.json`
  - Verify the package installs without errors and `node_modules/cloudflare` exists
  - **Requirements**: 4.1, 4.2

- [x] 2. Implement `apps/daemon/src/routes/site.ts`
  - [x] 2.1 Add internal type definitions: `FrameworkType`, `ArtifactInfo`, `DeployResult`, `DeleteResult`
  - [x] 2.2 Implement `validateEnv()` — reads `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DISPATCH_NAMESPACE` from `process.env`, throws `AppError(500, "missing required env var: <NAME>")` for any missing or empty var
  - [x] 2.3 Implement `validateScriptName(scriptName: string)` — throws `AppError(400)` if scriptName is empty/whitespace, contains chars outside `[A-Za-z0-9_-]`, or exceeds 64 characters
  - [x] 2.4 Implement `validateDeployBody(body: unknown)` — extracts and validates `projectDir` (non-empty string) and `scriptName` (passes `validateScriptName`), throws `AppError(400)` with appropriate messages
  - [x] 2.5 Implement `detectFramework(projectDir: string): Promise<FrameworkType>` — uses `fs.access()` to check directory existence, then checks for `vite.config.ts`/`vite.config.js` (returns `"vite"` if found), then `next.config.js`/`next.config.mjs`/`next.config.ts` (returns `"nextjs"` if found), throws `AppError(400)` if neither found or directory missing
  - [x] 2.6 Implement `locateArtifact(projectDir, framework): Promise<ArtifactInfo>` — for `"vite"`: checks `.output/worker.js`, `dist/worker.js`, `dist/_worker.js` in priority order, returns first found; for `"nextjs"`: checks `.vercel/output/static/_worker.js`; throws `AppError(400)` with the correct error message if not found
  - [x] 2.7 Implement `uploadWorker(scriptName, artifact, env)` — creates `Cloudflare({ apiToken })` client, reads artifact file as Buffer, calls `toFile()`, calls `client.workersForPlatforms.dispatch.namespaces.scripts.update()` with correct params including `main_module: artifact.filename`, `compatibility_date: "2025-01-01"`, `bindings: []`
  - [x] 2.8 Implement `deleteWorker(scriptName, env)` — creates `Cloudflare` client, calls `client.workersForPlatforms.dispatch.namespaces.scripts.delete()`, catches SDK `APIError` with `status === 404` and rethrows as `AppError(404, "worker not found: <scriptName>")`, rethrows all other errors as `AppError(500, ...)`
  - [x] 2.9 Implement `runDeployPipeline(body: unknown): Promise<DeployResult>` — calls `validateEnv()`, `validateDeployBody()`, `detectFramework()`, `locateArtifact()`, `uploadWorker()` in sequence; returns `{ scriptName, dispatchNamespace, framework }`
  - [x] 2.10 Export `deploy(state, body)`, `redeploy(state, body)`, `deleteSite(state, body)` — `deploy` and `redeploy` both call `runDeployPipeline(body)` and return `ok(result)`; `deleteSite` calls `validateEnv()`, validates scriptName, calls `deleteWorker()`, returns `ok({ scriptName, dispatchNamespace, deleted: true })`
  - **Requirements**: 1.1–1.6, 2.1–2.3, 3.1–3.2, 4.1–4.9, 5.1–5.7, 6.1–6.5, 7.1–7.6, 8.4

- [x] 3. Register site routes in `apps/daemon/src/router.ts`
  - Add `import * as siteRoutes from "./routes/site.js";` at the top of the file alongside existing route imports
  - Add three route entries inside the `DaemonRouter` constructor's routes array:
    - `["POST", "/api/site/deploy", (s, b) => siteRoutes.deploy(s, b)]`
    - `["POST", "/api/site/redeploy", (s, b) => siteRoutes.redeploy(s, b)]`
    - `["POST", "/api/site/delete", (s, b) => siteRoutes.deleteSite(s, b)]`
  - Verify TypeScript compiles without errors (`pnpm --filter @bunny-agent/daemon typecheck`)
  - **Requirements**: 8.1, 8.2, 8.3, 8.5

- [ ] 4. Write tests in `apps/daemon/src/__tests__/site.test.ts`
  - [-] 4.1 Validation tests — table-driven tests for `validateScriptName`: valid names pass, empty/whitespace/invalid-chars/too-long names each throw `AppError(400)` with correct message
  - [~] 4.2 Framework detection tests — mock `fs.access` to simulate: vite-only → `"vite"`, next-only → `"nextjs"`, both present → `"vite"`, neither → `AppError(400)`, missing directory → `AppError(400)`
  - [~] 4.3 Artifact location tests — mock `fs.access` to simulate Vite priority order (all three combinations), and Next.js found/not-found
  - [~] 4.4 Deploy pipeline test — mock `Cloudflare` SDK; verify `scripts.update` is called with correct `dispatchNamespace`, `scriptName`, `account_id`, `metadata.main_module`, and that `files` contains the script buffer
  - [~] 4.5 Delete pipeline test — mock SDK; verify `scripts.delete` called with correct args; verify SDK `APIError` with status 404 maps to `AppError(404)`; verify other SDK errors map to `AppError(500)`
  - [~] 4.6 Env var validation test — verify each of the three missing env vars individually produces `AppError(500)` with the correct message
  - [~] 4.7 Property-based test (Property 1) — use `fast-check` to generate arbitrary strings; assert `validateScriptName` passes iff string matches `/^[A-Za-z0-9_-]{1,64}$/`
  - [~] 4.8 Property-based test (Property 2) — use `fast-check` boolean flags to drive `fs.access` mocks; assert `detectFramework` returns `"vite"` iff hasVite, `"nextjs"` iff !hasVite && hasNext, throws iff !hasVite && !hasNext
  - [~] 4.9 Property-based test (Property 3) — use `fast-check` boolean flags for Vite candidate paths; assert `locateArtifact` returns the highest-priority existing path
  - Run `pnpm --filter @bunny-agent/daemon test` and verify all tests pass
  - **Requirements**: 1.1–1.6, 2.1–2.3, 3.1–3.2, 4.6–4.9, 5.3–5.6, 7.4–7.6

- [x] 5. Update `.env.example` to document `CLOUDFLARE_DISPATCH_NAMESPACE`
  - Add `CLOUDFLARE_DISPATCH_NAMESPACE=` entry in the Cloudflare section of `.env.example`, alongside the existing `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` entries
  - Add a brief comment explaining it is the Workers for Platforms dispatch namespace name
  - **Requirements**: 4.4, 4.8

## Notes

- Tasks 3, 4, and 5 are independent of each other and can run in parallel once Task 2 is complete.
- The `cloudflare` SDK's `APIError` class exposes a `status` field for HTTP status code detection — use this for the 404 mapping in `deleteWorker`.
- `fast-check` is already in `devDependencies` of `apps/daemon/package.json` — no additional install needed for PBT.
- The `AppState` parameter is passed to all route handlers but is not used by site routes — framework detection operates on the absolute `projectDir` from the request body, not the daemon's workspace root.
- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are already present in `.env.example`; only `CLOUDFLARE_DISPATCH_NAMESPACE` needs to be added.
