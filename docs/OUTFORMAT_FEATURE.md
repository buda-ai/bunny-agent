# Output Format Feature Summary

This note documents the addition of `--output-format` (`-o`) to `runner-cli`.

## What Was Added

- CLI option: `--output-format <stream|json>` (short: `-o`)
- Runner handling for stream vs JSON output
- SSE-to-JSON parsing to produce a single structured JSON object

## Where to Find Details

- Full guide: `docs/OUTPUT_FORMAT.md`
- CLI reference: `apps/runner-cli/README.md`

## Implementation Touchpoints

- `apps/runner-cli/src/cli.ts` (option parsing and validation)
- `apps/runner-cli/src/runner.ts` (SSE parsing and output formatting)

## Testing

Type checks and build passed during development:

```bash
pnpm typecheck
pnpm build
```
