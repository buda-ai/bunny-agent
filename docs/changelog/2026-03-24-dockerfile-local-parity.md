# Session changelog — 2026-03-24 — Dockerfile.local parity with Dockerfile

## Changed

- **`docker/sandagent-claude/Dockerfile.local`**: Align runtime with `docker/sandagent-claude/Dockerfile` (apt packages, `agent` user + `sudo nginx` in `start-cdp`, `simple-git` + `brave-search-cli` globals, `USER agent`, `EXPOSE` order). Replace “only `claude-agent-sdk` + copy two bundles” with **`pnpm deploy` for `@sandagent/runner-cli` and `@sandagent/daemon`** so production `node_modules` matches the npm-published layout. Builder uses **`pnpm install --filter "@sandagent/runner-cli..." --filter "@sandagent/daemon..."`** instead of the full workspace install.
