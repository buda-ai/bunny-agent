# Session changelog — 2026-03-20 (runner-cli npm install / Docker)

## Problem

Docker builds that run `npm install @bunny-agent/runner-cli@…` failed with **404** because the published package declared **`@bunny-agent/runner-core`** as a runtime dependency. `runner-core` is **private** and not on the public npm registry, so transitive install failed.

## Fix

- Removed duplicate `@bunny-agent/runner-core` from **`dependencies`** in `apps/runner-cli/package.json` (it remains only under **`devDependencies`** for the monorepo). The shipped CLI uses `dist/bundle.mjs`, which does not require `runner-core` to be installed from npm.

## Follow-up

- Cut and publish a new `@bunny-agent/runner-cli` version (e.g. patch) so the fixed `package.json` is on npm; until then, pinned installs of older tarballs will still pull the bad dependency list.
