# Session changelog — 2026-03-20 (daemon runner-core devDependency)

## Changes

- Moved `@sandagent/runner-core` from `dependencies` to `devDependencies` in `apps/daemon/package.json`. The package is workspace-only / not published on npm, matching `apps/runner-cli`.
