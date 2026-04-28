# 2026-04-22 Fix Publish Docker Image Name

## Problem

The `Publish Docker Image` workflow was still publishing and documenting the image
as `vikadata/sandagent` instead of the required `vikadata/bunny-agent`.

## Change

Updated `.github/workflows/publish-docker.yml` to use `vikadata/bunny-agent` in:

- Docker build-push tags (`<version>` and `latest`)
- Job summary image name and Docker Hub links
- Pull command examples in the workflow summary
