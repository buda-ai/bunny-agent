# 2026-03-19 Fix Publish Docker Image — Ensure Version Tag Is Always Pushed

## Problem

The **Publish Docker Image** workflow could silently push only the `latest` tag
without pushing the version-specific tag (e.g. `0.8.5`).

This happened when the `Extract version from tag` step produced an empty
`version` output. In that case the `tags` parameter of `docker/build-push-action`
would contain the invalid entry `ghcr.io/vikadata/sandagent:` alongside
`ghcr.io/vikadata/sandagent:latest`. The action silently dropped the malformed
tag and only pushed `latest`.

Root-cause scenario: `git tag --points-at HEAD` returned nothing (e.g. due to a
shallow clone or a race) AND `github.event.workflow_run.head_branch` was exactly
`v` (passes `startsWith(…, 'v')` but yields an empty version after stripping the
prefix).

## Fix — `.github/workflows/publish-docker.yml`

1. **Use `head_branch` as the primary source** of the version tag instead of
   relying solely on `git tag --points-at HEAD`. The event's `head_branch` is the
   git tag that triggered *Release on Tag* and is already validated by the job-level
   `if` condition.

2. **Cross-check with `git tag --points-at HEAD`** — if a proper semver tag exists
   at HEAD, it takes precedence (handles edge cases where `head_branch` carries
   unexpected values).

3. **Explicit semver validation** — after determining the version, the step now
   validates that it matches `^[0-9]+\.[0-9]+\.[0-9]`. If not, the job fails
   immediately with a clear error message instead of pushing an image with only a
   `latest` tag.

## Result

Every successful push of a `v*.*.*` tag now guarantees that **both** the
version-specific tag and `latest` are pushed to GHCR:

- `ghcr.io/vikadata/sandagent:<version>` (e.g. `ghcr.io/vikadata/sandagent:0.8.5`)
- `ghcr.io/vikadata/sandagent:latest`
