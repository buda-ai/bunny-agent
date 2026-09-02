# Web Demo Local Execution Mode

## Changes

- Added shared Bunny demo sandbox-provider parsing and cloud credential validation.
- Kept E2B as the fallback provider while allowing deployments to select direct
  host execution with the server-side `SANDBOX_PROVIDER=local` setting.
- Prevented browser requests from enabling local execution unless the deployment
  has explicitly enabled it.
- Added unit coverage for provider precedence, local-mode authorization, invalid
  providers, and provider-specific cloud credentials.

- Changed the sandbox factory to construct `LocalMachine` only for the explicit
  local provider and to reject missing cloud credentials instead of silently
  falling back to host execution.
- Made direct execution use the monorepo runner bundle when present and the
  installed `bunny-agent` command in deployment images otherwise.

- Updated both demo API routes to resolve the deployment provider consistently,
  accept host model credentials only in local mode, and return configuration
  failures as HTTP 400 responses.
- Updated Settings and chat readiness so deployment-default mode requires no
  browser sandbox key while explicit cloud selections require their matching key.
- Documented how to enable local mode and its host-execution security boundary.

## Verification

- `pnpm --filter @bunny-agent/web test`
- `pnpm --filter @bunny-agent/web types:check`
- `pnpm exec biome check <changed TypeScript files>`
- `pnpm --filter @bunny-agent/web... build`
- Started the demo with `SANDBOX_PROVIDER=local` on port 3040 and confirmed
  `GET /example` returns HTTP 200.
