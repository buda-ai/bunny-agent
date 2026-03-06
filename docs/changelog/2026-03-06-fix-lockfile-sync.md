# Fix: pnpm lockfile out of sync with runner-cli devDependencies

**Date:** 2026-03-06

## Problem

CI was failing with `--frozen-lockfile` because `apps/runner-cli/package.json` had new workspace devDependencies (`@sandagent/runner-codex`, `@sandagent/runner-gemini`, `@sandagent/runner-opencode`) that were not reflected in `pnpm-lock.yaml`.

## Fix

Ran `pnpm install --no-frozen-lockfile` to regenerate the lockfile with the correct workspace dependency references.
