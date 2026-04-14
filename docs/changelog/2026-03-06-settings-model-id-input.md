# Settings: Model ID input

## Summary

Added an optional **Model ID** field to the example app Settings page so users can override the default model used by the runner.

## Changes

- **apps/web/app/(example)/example/settings/page.tsx**
  - Added a new config entry in the Runner section: "Model ID" (`MODEL_ID`).
  - Description and placeholder explain usage (e.g. Claude model id, Pi model id). Optional; leave empty to use default.

- **apps/web/app/api/ai/route.ts**
  - Read `MODEL_ID` from the request body (already sent via `...clientConfig` from the example page).
  - Use `MODEL_ID` when set; otherwise keep existing default (same as before).

## Behavior

- Model ID is stored in localStorage with the rest of the config and sent to `/api/ai` on each request.
- If **Model ID** is set in Settings, that value is passed to `createBunnyAgent` / `streamText` as the model.
- If left empty, the API continues to use the previous default logic.
