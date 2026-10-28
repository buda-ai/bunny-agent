# Local Docker pnpm deployment

## Context

`docker/bunny-agent-claude/Dockerfile.local` copied locally built bundles into
the runtime image without installing modules marked as external by the
bundlers. The daemon consequently failed at startup when Node could not resolve
`jiti`, and the runner CLI had the same problem with `dotenv` and provider
SDKs. The file also retained obsolete `@sandagent/*` build filters.

## Changes

- Replaced the obsolete package build sequence with the current Bunny Agent
  runner-cli and daemon dependency graphs.
- Added a `pnpm deploy --prod --legacy` output for runner-cli so the local image
  carries its declared runtime dependencies.
- Placed the daemon bundle in the same deploy root because its only external
  module, `jiti`, is already part of the runner-cli production dependencies.
- Updated the runtime layout, commands, and entrypoint to use
  `/opt/bunny-agent` and `@bunny-agent/*` paths while retaining legacy command
  aliases.
- Kept Playwright in the shared runtime root while removing the manual list of
  bundle external dependencies.
- Removed unused musl-native package variants from the glibc-only image and
  skipped Playwright's unused Chromium headless shell download.
- Disabled recommended apt packages to keep the base runtime tool layer small.
- Declared the Node type dependency required to build `@bunny-agent/apply-patch`
  in a clean workspace.

## Verification

- Built the runner-cli and daemon dependency graphs successfully.
- Generated and executed the runner-cli deploy artifact and confirmed that it
  contains `jiti`, `dotenv`, all provider SDKs, and the patched `pi-ai` files.
- Built `vikadata/bunny-agent:0.61.0-beta.2-ls2` with `sudo make image-local`.
- Reduced the compressed image size from 1,389,329,080 bytes to 901,060,501
  bytes, a reduction of about 35 percent.
- Confirmed that the daemon listens on port 3080 and serves HTTP responses.
- Confirmed that both `bunny-agent` and the legacy `sandagent` alias start.
- Imported the Claude, Copilot, and Codex SDKs after pruning musl variants.
- Confirmed that the request-time Gemini thought-signature patch is present.
- Started Chromium and verified its CDP endpoint through nginx on port 9222.
