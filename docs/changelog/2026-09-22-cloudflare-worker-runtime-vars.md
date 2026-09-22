# Secure Cloudflare Worker Runtime Variables

## Implementation Plan

- Filter caller-supplied deployment variables at the daemon boundary with a
  case-insensitive reserved-name policy.
- Merge safe caller variables into Wrangler runtime `vars`, with explicit
  caller values taking precedence over existing same-named config values.
- Restore every temporarily patched Wrangler config on both successful and
  failed deploys.
- Replace daemon environment inheritance with a minimal cross-platform
  subprocess environment containing only host execution values and validated
  Cloudflare credentials.
- Cover Vite and Next.js config handling, filtering, precedence, restoration,
  credential forwarding, and ambient-secret isolation with focused tests.
- Add a patch changeset and run scoped lint, typecheck, and daemon tests.

## Progress

- Inspected the site route, deployment tests, package scripts, and repository
  instructions.
- Added a case-insensitive application-variable policy that excludes deployment
  credentials, platform namespaces, process-control variables, and invalid
  binding names.
- Added runtime `vars` merging for existing and generated Wrangler configs;
  existing entries are preserved and explicit caller entries win collisions.
- Isolated Wrangler deploy and delete subprocesses from the daemon environment
  while retaining the host values needed for executable lookup, temporary
  files, and Windows process startup. Application bindings are written only to
  temporary Wrangler config and never enter the local subprocess environment.
- Added focused coverage for both framework paths, config restoration, variable
  precedence and filtering, application-variable subprocess isolation,
  ambient-secret isolation, and credential delivery.
- Added a patch changeset for `@bunny-agent/daemon`.

## Verification

- Passed `pnpm --filter @bunny-agent/daemon exec vitest run src/__tests__/site.test.ts`
  (32 tests).
- Passed `pnpm --filter @bunny-agent/daemon typecheck` after building its
  internal workspace dependencies.
- Passed scoped Biome checks for the changed source, test, changelog, and
  changeset files.
- The full daemon test command completed 116 of 119 tests successfully. Three
  existing filesystem write-stream tests failed because their expected output
  files were absent; the same failures reproduced when those test files ran in
  isolation and do not exercise site deployment code.
