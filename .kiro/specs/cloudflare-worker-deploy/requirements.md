# Requirements Document

## Introduction

This feature adds REST API endpoints to the bunny-agent daemon (`apps/daemon/src/routes/site.ts`) that allow deploying, redeploying, and deleting Cloudflare Workers on behalf of users' project directories. Each project directory (e.g., `/Users/rang/workspace/vite-project`) is detected as either a Vite or Next.js project. The daemon does **not** build the project itself — instead, it reads already-built worker output files from the project directory and uploads them directly to a Cloudflare Workers for Platforms dispatch namespace using the official `cloudflare` Node.js SDK.

The daemon acts as a platform operator: it inspects the project's existing build artifacts, determines the correct entry file, and publishes it to Cloudflare as a named user Worker in a dispatch namespace, enabling the bunny-agent ecosystem to host and serve user applications on Cloudflare's edge network.

## Glossary

- **Deploy_Route**: The HTTP route handler module at `apps/daemon/src/routes/site.ts` that implements deploy, redeploy, and delete operations.
- **Framework_Detector**: The component within the Deploy_Route responsible for inspecting a project directory and determining its framework type.
- **Artifact_Locator**: The component within the Deploy_Route responsible for finding the built worker entry file in a project's output directory without running a build.
- **Cloudflare_Uploader**: The component within the Deploy_Route responsible for uploading built artifacts to the Cloudflare Workers for Platforms dispatch namespace via the `cloudflare` Node.js SDK.
- **Project_Directory**: An absolute filesystem path to a user's project (e.g., `/Users/rang/workspace/vite-project`).
- **Script_Name**: A unique identifier string used as the Worker's name in the Cloudflare dispatch namespace, provided by the caller.
- **Dispatch_Namespace**: The Cloudflare Workers for Platforms namespace that holds user Workers, configured via the `CLOUDFLARE_DISPATCH_NAMESPACE` environment variable.
- **Vite_Project**: A project that has a `vite.config.ts` or `vite.config.js` file in its root.
- **Next_Project**: A project that has a `next.config.js`, `next.config.mjs`, or `next.config.ts` file in its root.
- **Build_Artifact**: An already-built JavaScript module file present on disk in the project's output directory, suitable for upload as a Cloudflare Worker script.
- **ApiEnvelope**: The standard daemon response wrapper `{ ok: boolean, data: T | null, error: string | null }` defined in `utils.ts`.

## Requirements

### Requirement 1: Framework Detection

**User Story:** As a platform operator, I want the daemon to automatically detect whether a project is Vite-based or Next.js-based, so that the correct build artifact path is resolved without manual configuration.

#### Acceptance Criteria

1. WHEN the Deploy_Route receives a project directory path, THE Framework_Detector SHALL check for the presence of `vite.config.ts` or `vite.config.js` in the project root and classify the project as a Vite_Project if either file exists.
2. WHEN the Deploy_Route receives a project directory path and no Vite config file is present, THE Framework_Detector SHALL check for the presence of `next.config.js`, `next.config.mjs`, or `next.config.ts` in the project root and classify the project as a Next_Project if any such file exists.
3. IF both a Vite config file and a Next.js config file are present in the project root, THEN THE Framework_Detector SHALL classify the project as a Vite_Project (Vite takes precedence).
4. IF the Framework_Detector finds neither a Vite config nor a Next.js config in the provided project directory (directory exists and is readable but contains no supported framework files), THEN THE Deploy_Route SHALL return an HTTP 400 ApiEnvelope error indicating unsupported framework.
5. IF the provided project directory does not exist on the filesystem, THEN THE Deploy_Route SHALL return an HTTP 400 ApiEnvelope error with the message `"directory not found"`.
6. IF the provided project directory path is valid but the daemon process lacks permission to read it, THEN THE Deploy_Route SHALL return an HTTP 400 ApiEnvelope error with the message `"directory not found"`.
6. THE Framework_Detector SHALL perform detection by checking file existence only, without parsing file contents.

---

### Requirement 2: Vite Build Artifact Location

**User Story:** As a platform operator, I want the daemon to locate the pre-built Vite worker output file in the project directory, so that it can be uploaded to Cloudflare without triggering a build.

#### Acceptance Criteria

1. IF a project is classified as a Vite_Project, THE Artifact_Locator SHALL search for the worker entry file in the following paths within the Project_Directory, in priority order: `.output/worker.js`, `dist/worker.js`, `dist/_worker.js`, and SHALL return the first path from the list that exists on the filesystem.
2. IF the Project_Directory is inaccessible or cannot be read, THEN THE Artifact_Locator SHALL return an error indicating the directory could not be accessed.
3. IF none of the candidate paths exist, THEN THE Artifact_Locator SHALL return an error with the message `"vite build output not found: run your build first (expected .output/worker.js, dist/worker.js, or dist/_worker.js)"`.

---

### Requirement 3: Next.js Build Artifact Location

**User Story:** As a platform operator, I want the daemon to locate the pre-built Next.js worker output file generated by `@cloudflare/next-on-pages`, so that it can be uploaded to Cloudflare without triggering a build.

#### Acceptance Criteria

1. IF a project is classified as a Next_Project, THE Artifact_Locator SHALL look for the worker entry file at `.vercel/output/static/_worker.js` within the Project_Directory, and SHALL return that path if the file exists.
2. IF the file does not exist at that path, THEN THE Artifact_Locator SHALL return an error with the message `"next-on-pages build output not found: run 'npx @cloudflare/next-on-pages' first (.vercel/output/static/_worker.js)"`.

---

### Requirement 4: Worker Upload to Cloudflare Workers for Platforms

**User Story:** As a platform operator, I want the daemon to upload a located Build_Artifact to a Cloudflare Workers for Platforms dispatch namespace, so that the user project is deployed as an isolated Worker on Cloudflare's edge.

#### Acceptance Criteria

1. WHEN the Artifact_Locator returns a Build_Artifact path, THE Cloudflare_Uploader SHALL read the file contents and upload them to the configured Dispatch_Namespace as a module-type Worker script, using the artifact's base filename as the module specifier in the `main_module` metadata field.
2. THE Cloudflare_Uploader SHALL construct a `Cloudflare` client instance using `process.env.CLOUDFLARE_API_TOKEN` as the API token.
3. THE Cloudflare_Uploader SHALL use `process.env.CLOUDFLARE_ACCOUNT_ID` as the `account_id` parameter in all API calls.
4. THE Cloudflare_Uploader SHALL use `process.env.CLOUDFLARE_DISPATCH_NAMESPACE` as the dispatch namespace name in all API calls.
5. WHEN the upload succeeds, THE Cloudflare_Uploader SHALL return the script name, dispatch namespace, and the detected framework type (one of `"vite"` or `"nextjs"`) to the caller.
6. IF `CLOUDFLARE_API_TOKEN` is not set in the environment, THEN THE Deploy_Route SHALL return an HTTP 500 ApiEnvelope error with the message `"missing required env var: CLOUDFLARE_API_TOKEN"` without invoking the Cloudflare SDK.
7. IF `CLOUDFLARE_ACCOUNT_ID` is not set in the environment, THEN THE Deploy_Route SHALL return an HTTP 500 ApiEnvelope error with the message `"missing required env var: CLOUDFLARE_ACCOUNT_ID"` without invoking the Cloudflare SDK.
8. IF `CLOUDFLARE_DISPATCH_NAMESPACE` is not set in the environment, THEN THE Deploy_Route SHALL return an HTTP 500 ApiEnvelope error with the message `"missing required env var: CLOUDFLARE_DISPATCH_NAMESPACE"` without invoking the Cloudflare SDK.
9. IF the Cloudflare SDK throws an error during the upload, THEN THE Cloudflare_Uploader SHALL throw an error that the Deploy_Route catches and returns as an HTTP 500 ApiEnvelope error containing the Cloudflare error message.

---

### Requirement 5: Deploy Endpoint

**User Story:** As an API consumer, I want a `POST /api/site/deploy` endpoint that locates existing build artifacts and deploys them, so that I can trigger deployments programmatically after building my project.

#### Acceptance Criteria

1. THE Deploy_Route SHALL expose a `POST /api/site/deploy` endpoint that accepts a JSON body with `{ projectDir: string, scriptName: string }`.
2. WHEN `POST /api/site/deploy` is called with a non-empty `projectDir` and a valid `scriptName`, THE Deploy_Route SHALL perform framework detection, locate the Build_Artifact, and upload it to Cloudflare for both Vite and Next.js projects, in that sequential order.
3. IF `projectDir` is missing, empty, or whitespace-only in the request body, THEN THE Deploy_Route SHALL return an HTTP 400 ApiEnvelope error with the message `"projectDir is required"`.
4. IF `scriptName` is missing, empty, or whitespace-only in the request body, THEN THE Deploy_Route SHALL return an HTTP 400 ApiEnvelope error with the message `"scriptName is required"`.
5. IF `scriptName` contains characters other than alphanumerics, hyphens, and underscores, THEN THE Deploy_Route SHALL return an HTTP 400 ApiEnvelope error with the message `"scriptName must contain only alphanumeric characters, hyphens, and underscores"`.
6. IF `scriptName` exceeds 64 characters in length, THEN THE Deploy_Route SHALL return an HTTP 400 ApiEnvelope error indicating the name is too long.
7. WHEN the full deploy pipeline succeeds, THE Deploy_Route SHALL return an ApiEnvelope with `ok: true` and `data: { scriptName: string, dispatchNamespace: string, framework: "vite" | "nextjs" }`.

---

### Requirement 6: Redeploy Endpoint

**User Story:** As an API consumer, I want a `POST /api/site/redeploy` endpoint that re-uploads an existing project's build artifacts, so that I can update a deployed Worker after rebuilding my project.

#### Acceptance Criteria

1. THE Deploy_Route SHALL expose a `POST /api/site/redeploy` endpoint that accepts the same JSON body as `/api/site/deploy`: `{ projectDir: string, scriptName: string }`.
2. WHEN `POST /api/site/redeploy` is called with a valid body, THE Deploy_Route SHALL perform the identical pipeline as deploy (detect framework → locate artifact → upload), overwriting the existing script in the dispatch namespace with the newly-located Build_Artifact.
3. THE redeploy operation SHALL be idempotent: calling it multiple times with the same `projectDir` and `scriptName` SHALL always result in the most recently located Build_Artifact being the active Worker.
4. WHEN the redeploy pipeline succeeds, THE Deploy_Route SHALL return an ApiEnvelope with `ok: true` and `data: { scriptName: string, dispatchNamespace: string, framework: "vite" | "nextjs" }`.
5. IF any validation or pipeline step fails during redeploy, THE Deploy_Route SHALL return an ApiEnvelope with `ok: false` and a descriptive `error` string, using the same validation rules as the deploy endpoint.

---

### Requirement 7: Delete Worker Endpoint

**User Story:** As an API consumer, I want a `POST /api/site/delete` endpoint that removes a deployed Worker from the dispatch namespace, so that I can clean up resources when a project is no longer needed.

#### Acceptance Criteria

1. THE Deploy_Route SHALL expose a `POST /api/site/delete` endpoint that accepts a JSON body with `{ scriptName: string }`.
2. WHEN `POST /api/site/delete` is called with a valid `scriptName`, THE Cloudflare_Uploader SHALL invoke the Cloudflare Workers for Platforms delete API to remove the named Worker from the dispatch namespace.
3. WHEN the delete operation succeeds, THE Deploy_Route SHALL return an ApiEnvelope with `ok: true` and `data: { scriptName: string, dispatchNamespace: string, deleted: true }`.
4. IF `scriptName` is missing, empty, or whitespace-only in the request body, THEN THE Deploy_Route SHALL return an HTTP 400 ApiEnvelope error with the message `"scriptName is required"`.
5. IF the Cloudflare SDK throws a 404-equivalent error during deletion, THEN THE Deploy_Route SHALL return an HTTP 404 ApiEnvelope error with the message `"worker not found: <scriptName>"`.
6. IF the Cloudflare SDK throws any non-404 error during deletion, THEN THE Deploy_Route SHALL return an HTTP 500 ApiEnvelope error with a descriptive message from the SDK error.

---

### Requirement 8: Route Registration in DaemonRouter

**User Story:** As a daemon integrator, I want the site deploy/redeploy/delete routes registered in the `DaemonRouter`, so that the endpoints are reachable through the standard daemon HTTP server.

#### Acceptance Criteria

1. THE DaemonRouter SHALL register a `POST /api/site/deploy` route mapped to `siteRoutes.deploy` in its routes array.
2. THE DaemonRouter SHALL register a `POST /api/site/redeploy` route mapped to `siteRoutes.redeploy` in its routes array.
3. THE DaemonRouter SHALL register a `POST /api/site/delete` route mapped to `siteRoutes.deleteSite` in its routes array.
4. THE Deploy_Route module SHALL export named functions `deploy`, `redeploy`, and `deleteSite`, each conforming to the `RouteHandler` signature `(state: AppState, params: any) => Promise<ApiEnvelope>`.
5. WHEN the DaemonRouter is instantiated without any Cloudflare environment variables set, THE DaemonRouter SHALL still initialize successfully; environment variable validation SHALL occur at request time, not at startup. THE DaemonRouter MAY fail to initialize for non-environment-variable reasons such as module loading errors or route registration failures.

---

### Requirement 9: Wrangler CLI Installation in Sandbox Docker Image

**User Story:** As a sandbox agent, I want the `wrangler` CLI to be pre-installed in the Docker sandbox image, so that I can use it directly to deploy and manage Cloudflare Workers from within the sandbox environment without any additional setup.

#### Acceptance Criteria

1. THE Dockerfile (`docker/bunny-agent-claude/Dockerfile`) SHALL install `wrangler` globally via `npm install -g wrangler@latest` before the `USER agent` instruction, ensuring the binary is available system-wide at a reproducible, current version.
2. WHEN the sandbox container starts, running `wrangler --version` as the `agent` user from any working directory SHALL exit with code 0 and print the installed version string.
3. WHILE `CLOUDFLARE_API_TOKEN` is set in the container environment, invoking `wrangler` commands that require authentication SHALL proceed past authentication without prompting for interactive login.
4. THE Dockerfile SHALL NOT declare a default value for `CLOUDFLARE_API_TOKEN` via an `ENV` instruction; the token SHALL be supplied exclusively at container runtime via the environment.
5. IF `wrangler` is invoked inside the container without `CLOUDFLARE_API_TOKEN` set in the environment, THEN `wrangler` SHALL exit with a non-zero exit code and print an authentication error message to stderr.
