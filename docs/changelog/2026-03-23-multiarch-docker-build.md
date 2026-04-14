# 2026-03-23 Add Multi-Arch Support to Docker Build Workflow

## Changes

### `.github/workflows/publish-docker.yml`

- Added `docker/setup-qemu-action@v3` step before the Buildx setup to enable
  QEMU emulation, which is required for cross-platform builds on AMD64 GitHub
  Actions runners.
- Changed `platforms` from `linux/amd64` to `linux/amd64,linux/arm64` so the
  published `vikadata/bunny-agent` image supports both x86-64 (AMD/Intel) and
  ARM64 (Apple Silicon, AWS Graviton, etc.) architectures.

## Result

The Docker Hub image `vikadata/bunny-agent:<version>` and `vikadata/bunny-agent:latest`
are now multi-platform manifests containing both `linux/amd64` and `linux/arm64`
variants. Docker automatically pulls the correct variant for the host platform.
