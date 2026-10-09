# Pi Native ReadImage Design

## Context

DeepSeek Harness separates native image reading from OCR: its file tool returns
image content after checking model capabilities. Bunny Agent can use the same
approach through Pi's existing native image pipeline and session history.

Reference: [DeepSeek Harness read_image](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/fs/tool-fs/src/read-image.ts).
Unlike Harness's durable attachment store and provider-specific Files API
handling, this change uses the installed Pi `0.80.10` native image content and
session persistence directly.

## Tool and Model Boundary

Expose a Pi tool named `read_image`, labeled `ReadImage`, with a required
`file_path` string. Resolve paths using the runner working directory and reuse
Pi's image handling and resizing. Successful results contain a native image
block and explanatory text. Missing files, non-image files, unsupported formats,
and damaged images produce understandable errors without a success image block.

Check the current Pi model's `input` declaration when executing the tool. Models
without `image` input receive a diagnostic suggesting an existing OCR tool or a
vision-capable model. Apply the same capability boundary before prompting with
uploaded images. Keep the existing registration behavior for dynamic models,
which declares image support without verifying the remote endpoint.

## Integration

Register the tool alongside existing Pi tools. Explicit `allowedTools` lists
must include `read_image`; allowing `read` alone does not authorize the new
tool. Use existing approval and cancellation handling, and redact result text
through the existing wrapper while preserving binary image content.

Preserve uploaded image ordering and labels. Persist and restore native image
content through Pi's existing session mechanism. Do not create a new attachment
store, use DeepSeek Files API, add an image preview UI, or alter other runners.
Keep bash and MCP OCR available through their existing configuration and
permissions; no OCR fallback service is added.

## Verification Strategy

Unit tests cover content blocks, input errors, capability checks, permissions,
approval denial, cancellation, and upload ordering. Local E2E tests use actual
built CLI, daemon, and SDK code with a local model-protocol server to inspect
outgoing image bytes and restored history. This proves transport, not visual
understanding. An explicitly enabled live test uses random text, colors, and
shapes to validate both file reading and uploads against a real vision model.
Record unavailable credentials or OCR environments as unverified coverage.
