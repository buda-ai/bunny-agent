# Session changelog — 2026-03-24 — Docker build context size

## Changed

- **`.dockerignore`**: Exclude `apps/web.bak` (large Next.js / Turbopack caches under `.next`), and add `**/.next` / `**/.turbo` so nested caches are not sent to Docker. Reduces `docker build` context and avoids “no space left on device” when copying the repo.
- **`pnpm-workspace.yaml`**: Exclude `apps/web.bak` from workspace packages so `pnpm install` in Docker (where that folder is absent from context) stays valid.
