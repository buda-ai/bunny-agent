# Pi Native ReadImage

## Why

Pi already supports native image content and uploaded images, but Bunny Agent
does not expose a dedicated file-image tool. Agents need an explicit way to
inspect sandbox images without treating OCR as a prerequisite. Images must not
be silently discarded when the selected model declares text-only input.

## What Changes

- Add `read_image({ file_path: string })`, labeled `ReadImage`, to the Pi runner.
- Reuse Pi image detection, decoding, resizing, and native image content blocks.
- Reject unsupported or damaged files and models without declared image input.
- Apply existing tool allowlists, approval, cancellation, and text redaction.
- Preserve uploaded image labels and order, and reject uploads for text models.
- Add unit and local CLI/daemon/SDK transport coverage plus opt-in live vision
  coverage for file images and uploaded images.
- Document the existing bash/MCP OCR extension path without adding an OCR backend.

## Impact

The only new model-facing tool interface is `read_image` with a required
`file_path` string. Existing Pi `read`, OCR extensions, AskUserQuestion, other
runners, and session persistence remain available. No attachment store or
DeepSeek Files API is introduced. Dynamically registered models retain their
existing image input declaration; that declaration is not remote capability
verification. No runtime deployment or release is performed by this change.
