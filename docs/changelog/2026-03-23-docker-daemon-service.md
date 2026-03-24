# Session changelog — 2026-03-23 (Docker image: sandagent-daemon)

## Changes

- **`docker/sandagent-claude/Dockerfile`**, **`Dockerfile.template`**, **`Dockerfile.local`**: Install `@sandagent/daemon` (npm version aligned with `RUNNER_CLI_VERSION`, or copy local `dist/bundle.mjs` in `Dockerfile.local`).
- Add `/usr/local/bin/sandagent-daemon` launcher (same pattern as `sandagent`).
- Set `ENV` `SANDAGENT_ROOT`, `SANDAGENT_DAEMON_HOST`, `SANDAGENT_DAEMON_PORT`.
- **`EXPOSE 3080`** for the daemon HTTP API; keep **`EXPOSE 9222`** for CDP.
- **`CMD`**: run `sandagent-daemon &` before `start-cdp`, then `sleep infinity`.
- **`Dockerfile.local`**: Builder runs `pnpm --filter @sandagent/runner-core build` and `pnpm --filter @sandagent/daemon build`; copy daemon bundle into `/opt/sandagent/node_modules/@sandagent/daemon/dist/`.
- **`apps/daemon/README.md`**: Document daemon in `vikadata/sandagent` image.
