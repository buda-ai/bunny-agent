# Fix Vercel deploy workflow when secrets are missing

**Date:** 2026-04-23

## Summary

Prevented the Vercel deploy example workflow from failing when required Vercel
secrets are not configured.

## Changes

### `.github/workflows/deploy-example.yml`
- Added secret-presence guards to all Vercel CLI steps.
- Vercel pull/build/deploy steps now run only when branch conditions are met and
  `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are all present.
- This avoids running commands like `--token=` with an empty value, which caused
  `No existing credentials found` failures in CI.

## Follow-up Fix

- Replaced `secrets.*` references inside step `if:` expressions with `env.*`
  references because GitHub Actions expressions in `if` do not support direct
  `secrets` context access.
- Added `VERCEL_TOKEN` to workflow-level `env` and reused env variables in
  guarded Vercel steps.
- Updated Vercel CLI invocations to use `"$VERCEL_TOKEN"` from environment.
