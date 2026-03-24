# Session changelog — 2026-03-24 — Docker Hub base image override

## Changed

- **`docker/sandagent-claude/Dockerfile.local`**: Added `ARG NODE_IMAGE=node:20-slim` so both stages can use an alternate base when Docker Hub is unreachable.
- **`docker/sandagent-claude/Makefile`**: `image-local` passes `NODE_IMAGE` (default `node:20-slim`); documented in `make help`.
- **`docker/sandagent-claude/README.md`**: Troubleshooting for Docker Hub `EOF` / timeout when resolving `node:20-slim`.
