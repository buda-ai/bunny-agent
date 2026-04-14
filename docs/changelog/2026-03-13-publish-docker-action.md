# 2026-03-13 Add GitHub Action — Publish Docker Image After npm Tag Release

## Session Log

- Added `.github/workflows/publish-docker.yml`:
  - Triggers via `workflow_run` on successful completion of the **Release on Tag** workflow
  - Extracts the semver version from the git tag (strips leading `v`)
  - Logs in to Docker Hub using repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
  - Builds `docker/bunny-agent-claude/Dockerfile` for `linux/amd64` using Docker Buildx
  - Pushes two tags to Docker Hub:
    - `vikadata/bunny-agent:<version>` (e.g. `vikadata/bunny-agent:1.2.3`)
    - `vikadata/bunny-agent:latest`

## Required Repository Secrets

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username (`vikadata`) |
| `DOCKERHUB_TOKEN` | Docker Hub access token with write permission |
