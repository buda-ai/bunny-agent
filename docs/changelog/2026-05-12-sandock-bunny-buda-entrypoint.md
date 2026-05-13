# 2026-05-12 - Sandock bunny-buda entrypoint detection

## Problem

The web example accepted `SANDBOX_IMAGE=vikadata/bunny-buda:0.9.37`, but the
Sandock adapter only passed the bundled Bunny entrypoint for image names matching
`bunny-agent` or `sandagent`. Sandock replaces the Docker image entrypoint unless
the command is provided explicitly, so `bunny-agent-daemon` did not start and the
`/healthz` probe failed.

The sandbox cache key also ignored the image tag, so changing `SANDBOX_IMAGE`
could still attach to a previously created sandbox.

## Changes

- Treat `vikadata/bunny-*` Sandock images as bundled Bunny images that need the
  explicit image entrypoint command.
- Include the resolved sandbox image in the sandbox cache fingerprint so image
  changes create or attach to the correct runtime.

## Files Changed

- `apps/web/lib/example/create-sandbox.ts`
