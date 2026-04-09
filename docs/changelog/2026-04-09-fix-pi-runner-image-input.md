# Fix: Pi runner auto-registered models missing image input support

**Date:** 2026-04-09

## Problem

When using a model not in pi's built-in catalog (auto-registered via `OPENAI_BASE_URL`),
the model was registered with `input: ["text"]` only. This caused pi-ai's provider layer
to silently drop image data from tool results (e.g. the `read` tool reading an image file),
because it checks `model.input.includes("image")` before including image content in the
LLM API request.

The model would only see `"Read image file [image/png]"` text but never the actual image
data, making image recognition impossible for auto-registered models.

## Fix

Changed the auto-registration in `packages/runner-pi/src/pi-runner.ts` to declare
`input: ["text", "image"]`, matching the convention used by most built-in models in
pi's catalog.
