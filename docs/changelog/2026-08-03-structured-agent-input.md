# Structured Agent Input V1

## Summary

Bunny Agent now accepts a versioned `AgentTurnInputV1` alongside the one-release `userInput` text fallback. The protocol keeps assets, semantic bindings, capabilities, and server-resolved execution context separate.

## Changes

- Added strict parsing and negotiation for typed text, image, skill, integration, reference, capability, and extension inputs.
- Added secret rejection for execution context, extension payloads, and display snapshots.
- Added structured daemon and CLI transport with one-shot environment payload cleanup.
- Added Claude labeled image blocks and Pi `message + images` delivery.
- Added Vercel AI SDK conversion that freezes `[Image #N]` labels and resolves URL/data-URL images.
- Unsupported runner/image and extension combinations now fail before execution instead of degrading to text.

## Compatibility

`userInput` remains accepted for one release. Consumers should migrate to `AgentTurnInputV1` before the fallback is removed.

## Verification

Manager, daemon, CLI, SDK, runner harness, Claude, and Pi focused suites cover protocol validation, image order, resume behavior, and unsupported input rejection.
