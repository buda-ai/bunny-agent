# 2026-03-12 Tag-Based Changeset Release Workflow

## Session Log

- Added `.github/workflows/release-tag.yml` — a new GitHub Actions workflow that triggers
  on any `v*.*.*` tag push and implements the full changeset release flow without interactive input:
  1. Auto-generates a patch changeset for all fixed-group packages if no pending changesets exist.
  2. Runs `pnpm changeset version` to bump `package.json` versions and write `CHANGELOG.md` entries.
  3. Runs `pnpm changeset publish` to publish every bumped package to npm.
  4. Uses `peter-evans/create-pull-request@v7` to open a PR back to `main` with all version-bump
     file changes, so the repository stays in sync with what was published.
- Fixed `.github/workflows/release.yml`: added the missing `publish: pnpm changeset publish`
  command to `changesets/action`. Previously the action only created the "Version Packages" PR but
  never published to npm when that PR was merged.
- Added `NODE_AUTH_TOKEN` env var to `release.yml` `changesets/action` step so npm auth works
  during the publish phase.
