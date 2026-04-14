# Fix Docker Publish Workflow Job Summary

## Problem

The `publish-docker.yml` workflow job summary only showed the generic Docker
build record summary (a `.dockerbuild` archive download link) which gave no
useful information about which image was actually built and pushed.

## Change

Added a **Write job summary** step at the end of the `publish-docker` job that
writes a clean Markdown table to `$GITHUB_STEP_SUMMARY` showing:

- The Docker image name (`vikadata/bunny-agent`)
- The version tag and `latest` tag, each with a link to Docker Hub
- The source Git tag
- Target platforms (`linux/amd64`, `linux/arm64`)
- The image digest
- Build status (✅ / ❌)
- A ready-to-copy `docker pull` snippet

The step runs with `if: always()` so the summary is written even when the build
step fails, making it easy to diagnose failures directly from the Actions
summary page.
