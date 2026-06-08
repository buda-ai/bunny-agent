# Cloudflare Worker Deploy - Real Call Test & Dev Script Fix

## Date: 2026-06-05

## Changes

### `apps/daemon/package.json`
- Updated `dev` script to use `node --env-file=../../.env dist/bundle.mjs` so the workspace root `.env` is automatically loaded when running `pnpm dev` from `apps/daemon`
- This ensures `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_DISPATCH_NAMESPACE` are available to the daemon process without manual environment setup

## Test Results

Deployed `~/workspace/vite-project` (Vite framework, `dist/_worker.js` artifact) to Cloudflare Workers for Platforms:

- `POST /api/site/deploy` → `{"ok":true,"data":{"scriptName":"vite-test-app","dispatchNamespace":"workers-for-platforms-example-project","framework":"vite"}}`
- `POST /api/site/redeploy` → same success response

Both endpoints working correctly against the `workers-for-platforms-example-project` namespace.
