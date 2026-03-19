# 2026-03-19 Fix Publish Docker Image — Switch to GitHub Container Registry

## Problem

The **Publish Docker Image** CI workflow was failing with `##[error]Username required` because
the `DOCKERHUB_USERNAME` repository secret was not set.

## Fix

Migrated from Docker Hub to **GitHub Container Registry (GHCR)**, which uses the built-in
`GITHUB_TOKEN` — no external secrets required.

### Changes to `.github/workflows/publish-docker.yml`

- Added `packages: write` permission (required for pushing to GHCR)
- Replaced `docker/login-action` credentials:
  - **Before**: `username: ${{ secrets.DOCKERHUB_USERNAME }}`, `password: ${{ secrets.DOCKERHUB_TOKEN }}`
  - **After**: `registry: ghcr.io`, `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`
- Updated pushed image tags:
  - **Before**: `vikadata/sandagent:<version>` and `vikadata/sandagent:latest` (Docker Hub)
  - **After**: `ghcr.io/vikadata/sandagent:<version>` and `ghcr.io/vikadata/sandagent:latest` (GHCR)

## Image Location

| Tag | URL |
|-----|-----|
| Latest | `ghcr.io/vikadata/sandagent:latest` |
| Versioned | `ghcr.io/vikadata/sandagent:<version>` |
