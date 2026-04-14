# 2026-03-12 Fix Release Tag CI Publish Scope

## Session Log

- Modified `.github/workflows/release-tag.yml` to replace the `pnpm changeset publish` command with
  explicit per-package publish commands.
- The release tag CI now publishes only the following fixed set of packages:
  - `@bunny-agent/sdk`
  - `@bunny-agent/manager`
  - `@bunny-agent/sandbox-sandock`
  - `@bunny-agent/runner-cli`
- Packages `@bunny-agent/sandbox-e2b` and `@bunny-agent/sandbox-daytona` are no longer published on tag release.
