# 2026-04-22 Fix Publish Docker Release Tag Context

## Problem

The `Publish Docker Image` workflow failed for release tags created before the
`sandagent` → `bunny-agent` Docker directory rename. It always used
`docker/bunny-agent-claude`, which does not exist in older release-tag source code.

## Change

Updated `.github/workflows/publish-docker.yml` to resolve Docker build context
from the checked-out release tag code:

- Use `docker/bunny-agent-claude/Dockerfile` when present.
- Fallback to `docker/sandagent-claude/Dockerfile` for older tags.
- Fail with a clear error if neither Docker context exists.

This keeps Docker publishing aligned with the actual release tag source code.
