# Session changelog — 2026-03-24 — Playwright apt + QEMU (multi-arch build)

## Problem

`docker buildx build --platform linux/amd64,linux/arm64` on Apple Silicon can fail at `npx playwright install --with-deps chromium` on **linux/amd64** with Debian `apt` errors: `At least one invalid signature was encountered` / `is not signed`, while **linux/arm64** succeeds. That path uses QEMU emulation; Playwright’s second `apt-get` is a common failure point.

## Change

**`Dockerfile`**, **`Dockerfile.template`**, **`Dockerfile.local`**: Before Playwright runs, reinstall `ca-certificates`, `debian-archive-keyring`, and `gnupg`, clear apt lists, then run `DEBIAN_FRONTEND=noninteractive npx playwright install --with-deps chromium` in the same `RUN`.

## If it still fails locally

- Retry after `docker builder prune` (stale cache).
- Build only the native arch on Mac: `--platform linux/arm64`.
- Run multi-arch builds on **Linux CI** (native `amd64` / `arm64`) for reliable manifests.
