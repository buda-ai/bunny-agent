# Fix Docker image build: @sandagent/runner-core not on npm

## Problem

`sandagent image build` (and `docker build -f docker/sandagent-claude/Dockerfile ...`) failed with:

```
npm error 404 Not Found - GET https://registry.npmjs.org/@sandagent%2frunner-core - Not found
'@sandagent/runner-core@0.1.0' is not in this registry.
```

The image installs `@sandagent/runner-cli` from npm; runner-cli listed `@sandagent/runner-core` as a dependency, but runner-core is workspace-only and not published.

## Solution

- Moved `@sandagent/runner-core` from **dependencies** to **devDependencies** in `apps/runner-cli/package.json`.
- The published CLI bundle (`dist/bundle.mjs`) already inlines runner-core (and runner-* code) via esbuild, so the published package does not need runner-core at runtime.
- Consumers that `npm install @sandagent/runner-cli` no longer pull in runner-core; Docker image build succeeds.

After publishing a new `@sandagent/runner-cli` version (e.g. 0.8.5), use that version in the image build. Until then, you can build the image from source with `docker build -f docker/sandagent-claude/Dockerfile.local -t vikadata/sandagent:local .` from the repo root.
