# Persist and verify dispatch Worker environment bindings

Date: 2026-09-22

## What Changed

- After Wrangler uploads a dispatch-namespace script, explicitly PATCH its
  namespace-scoped Cloudflare settings with safe application variables as
  `plain_text` bindings.
- Preserve unrelated existing bindings while replacing variables with the same
  names.
- Read the settings back and fail deployment when Cloudflare omits any requested
  binding.
- Return `applicationEnvBindingCount` only after that verification succeeds.
- Added coverage for preserving assets, replacing existing text bindings,
  filtering reserved variables, and rejecting incomplete persistence.

## Why

`wrangler deploy --dispatch-namespace` successfully uploaded the script but did
not persist top-level Wrangler `vars` on the namespace script. This produced a
successful deployment with zero bindings in Cloudflare. The namespace settings
API is the authoritative binding surface, so deployment now writes and verifies
there directly.

## Testing

- `pnpm --filter @bunny-agent/daemon test` — 121 tests passed.
- `pnpm --filter @bunny-agent/daemon typecheck`
- `pnpm run -w lint` — 355 files passed after formatting.
- CI follow-up: applied Biome formatting to the changed daemon source and test
  files after the repository lint job reported formatting differences.
- Live Cloudflare round-trip against the existing dispatch script: the settings
  API returned `PRODUCT_NAME` and `TITLE` as `plain_text` bindings after PATCH.
  Values were neither logged nor printed.
