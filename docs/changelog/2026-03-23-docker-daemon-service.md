# Session changelog — 2026-03-23 (Docker image: bunny-agent-daemon)

## Changes

- **`docker/bunny-agent-claude/Dockerfile`**, **`Dockerfile.template`**, **`Dockerfile.local`**: Install `@bunny-agent/daemon` (npm version aligned with `RUNNER_CLI_VERSION`, or copy local `dist/bundle.mjs` in `Dockerfile.local`).
- Add `/usr/local/bin/bunny-agent-daemon` launcher (same pattern as `bunny-agent`).
- Set `ENV` `BUNNY_AGENT_ROOT`, `BUNNY_AGENT_DAEMON_HOST`, `BUNNY_AGENT_DAEMON_PORT`.
- **`EXPOSE 3080`** for the daemon HTTP API; keep **`EXPOSE 9222`** for CDP.
- **`CMD`**: run `bunny-agent-daemon &` before `start-cdp`, then `sleep infinity`.
- **`Dockerfile.local`**: Builder runs `pnpm --filter @bunny-agent/runner-core build` and `pnpm --filter @bunny-agent/daemon build`; copy daemon bundle into `/opt/bunny-agent/node_modules/@bunny-agent/daemon/dist/`.
- **`apps/daemon/README.md`**: Document daemon in `vikadata/bunny-agent` image.
