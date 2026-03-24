# Daemon: remove `dev:clean` (2026-03-24)

- Removed `pnpm --filter @sandagent/daemon dev:clean` and `scripts/run-standalone-clean.sh`.
- README recommends sandbox testing for isolated runner env. (Per-request runner env header was removed later; see `2026-03-24-remove-runner-env-header.md`.)
