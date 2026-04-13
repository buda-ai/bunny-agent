# Session changelog — 2026-03-20 (daemon in fixed release group)

## Changes

- Added `@bunny-agent/daemon` to the changesets **fixed** group in `.changeset/config.json` so it versions together with the other published `@bunny-agent/*` packages.
- Set `apps/daemon` `package.json` version to `0.8.5` to match the current fixed-group line (`sdk`, `manager`, `sandbox-*`, `runner-cli`).
- Extended **Release on Tag** (`release-tag.yml`) and **Publish Selected Packages** (`publish-runner-cli.yml`) workflows to publish `@bunny-agent/daemon`.
- Documented `@bunny-agent/daemon` in `docs/PUBLISHING_GUIDE.md` published package table.
