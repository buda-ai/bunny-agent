# 2026-03-20 Publish Docker Image to Docker Hub

## Problem

The **Publish Docker Image** workflow was pushing images only to GitHub Container
Registry (`ghcr.io/vikadata/bunny-agent`). The requirement is to publish to
**Docker Hub** (`vikadata/bunny-agent`) instead.

## Fix — `.github/workflows/publish-docker.yml`

1. **Replace GHCR login with Docker Hub login** — use `docker/login-action@v3`
   with `secrets.DOCKERHUB_USERNAME` and `secrets.DOCKERHUB_TOKEN` (no `registry`
   field, which defaults to Docker Hub).

2. **Update image tags** — tags changed from:
   - `ghcr.io/vikadata/bunny-agent:<version>`
   - `ghcr.io/vikadata/bunny-agent:latest`

   to:
   - `vikadata/bunny-agent:<version>`
   - `vikadata/bunny-agent:latest`

3. **Remove `packages: write` permission** — this permission was only required
   for pushing to GHCR. Docker Hub authentication uses repository secrets, so the
   permission is no longer needed.

## Required Repository Secrets

The following secrets must be set in the repository settings
(**Settings → Secrets and variables → Actions**):

| Secret name         | Description                                       |
|---------------------|---------------------------------------------------|
| `DOCKERHUB_USERNAME`| Docker Hub account username (e.g. `vikadata`)     |
| `DOCKERHUB_TOKEN`   | Docker Hub access token (Personal Access Token)   |
