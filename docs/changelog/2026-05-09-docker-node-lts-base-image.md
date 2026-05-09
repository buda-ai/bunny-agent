# 2026-05-09 Docker Node 24 Base Image

## Changes

- Replaced `node:lts-slim` with the hardcoded current Node LTS image `node:24-slim` in `docker/bunny-agent-claude/Dockerfile`.
- Updated `docker/bunny-agent-claude/Dockerfile.template` so generated Dockerfiles also use `node:24-slim`.
- Updated `docker/bunny-agent-claude/Dockerfile.local` builder and runtime stages to use `node:24-slim`.
- Updated the runner CLI Dockerfile generation test to assert the hardcoded `node:24-slim` base image.

## Validation

- Pre-change repository validation:
  - Verified on the Node.js release page that Node 24 is the current LTS release.
  - `pnpm --filter @bunny-agent/runner-cli build` ⚠️ fails because local workspace runner packages are not built in isolation
  - `pnpm --filter @bunny-agent/runner-cli test` ⚠️ fails due pre-existing unrelated runner-cli test failures in this checkout
  - `pnpm --filter @bunny-agent/runner-cli typecheck` ⚠️ fails because local workspace runner packages are not built in isolation
