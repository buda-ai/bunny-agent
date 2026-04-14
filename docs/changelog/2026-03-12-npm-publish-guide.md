# 2026-03-12 Add Developer Guide — Publishing npm Packages

## Session Log

- Added `apps/web/content/docs/advanced/publishing-npm-packages.mdx`: a comprehensive guide covering
  - Which packages are published (`@bunny-agent/sdk`, `@bunny-agent/manager`, `@bunny-agent/sandbox-sandock`, `@bunny-agent/runner-cli`)
  - Tag-based release workflow vs. push-based automatic publishing
  - Step-by-step contributor workflow (changeset → PR → merge → publish)
  - How to trigger a tagged release
  - Pre-release / beta workflow on the `develop` branch
  - Required `NPM_TOKEN` repository secret and how to generate it
  - How to verify a publish succeeded
  - How to add a new published package to the monorepo
- Updated `apps/web/content/docs/advanced/meta.json` to include the new page in the documentation navigation.
