# Unified daemon health and control capabilities

Date: 2026-10-27
Author: Codex

## Request

Expose real Pi steering capabilities through `/healthz` alongside search
contracts, allowing consumers to reuse readiness results instead of probing
search and control capabilities separately.

## Changes

- Both standalone HTTP and Next.js daemon adapters pass their existing coding
  run/control registry into the health router. No second registry is created.
- Health reports `data.capabilities.codingControl` with the same version and
  durable Pi steering support returned by the legacy control capabilities route.
- Health and control reuse the registry's existing memoized journal
  initialization. Failed journal initialization leaves health at HTTP 200 and
  advertises steering as unavailable without running a model.
- Existing health fields and the legacy control capability operation are kept.
- README and daemon patch changeset document the public response additions.

## Validation

- Integration tests cover real standalone HTTP, Next.js requests, control/health
  parity, 12 concurrent probes sharing one failed journal initialization, and
  no runner/model invocation.
- The existing active-run control test now reads health before steering to ensure
  discovery preserves the active run registry.
- `pnpm --filter @bunny-agent/daemon... build` passed for the daemon and its
  12 workspace dependencies, including standalone and Next.js production bundles.
- `pnpm --filter @bunny-agent/daemon typecheck` passed.
- The full daemon suite passed: 134 tests across eight files, including the
  production packaging regression tests.
- Biome passed for all six changed TypeScript files after formatting.

## Risks

The declaration describes instance-level durable control availability. Per-run
readiness and receipts must still be queried through control status, and older
daemons do not expose the new health fields.
