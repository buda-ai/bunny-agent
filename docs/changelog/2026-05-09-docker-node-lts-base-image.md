# 2026-05-09 Docker Node LTS Base Image

## Changes

- Updated `docker/bunny-agent-claude/Dockerfile` to use `node:lts-slim`.
- Updated `docker/bunny-agent-claude/Dockerfile.template` to keep generated Dockerfiles aligned with the LTS base image.
- Updated `docker/bunny-agent-claude/Dockerfile.local` builder and runtime stages to use `node:lts-slim`.
- Updated the runner CLI Dockerfile generation test to assert the new base image.

## Validation

- Pre-change repository validation:
  - `pnpm lint` ✅ (1 existing warning in `apps/web/app/(example)/example/page.tsx`)
  - `pnpm build` ⚠️ fails in `apps/web` because Next.js could not fetch the Inter font from Google Fonts
  - `pnpm test` ✅
  - `pnpm typecheck` ✅
