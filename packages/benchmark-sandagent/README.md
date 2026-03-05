# @sandagent/benchmark-sandagent

Benchmark for testing **sandagent CLI** with different `--runner` options.

## Purpose

Tests the performance of sandagent's runner implementations:
- `sandagent run --runner claude`
- `sandagent run --runner pi`
- `sandagent run --runner codex`
- `sandagent run --runner copilot`

## Comparison with @sandagent/benchmark

| Package | Tests | Purpose |
|---------|-------|---------|
| `@sandagent/benchmark` | Native CLIs (claude, gemini, codex) | Compare original agent CLIs |
| `@sandagent/benchmark-sandagent` | sandagent --runner X | Test sandagent's runner implementations |

Both share core logic from `@sandagent/benchmark-shared`.

## Usage

```bash
# Download GAIA dataset
pnpm benchmark:download

# Run with different runners
pnpm benchmark:run -- --runner claude --level 1 --limit 10
pnpm benchmark:run -- --runner pi --level 1 --limit 10

# Compare results
pnpm benchmark:compare
```

## Architecture

```
@sandagent/benchmark-sandagent
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── runner.ts           # Benchmark execution
│   ├── compare.ts          # Result comparison
│   ├── types.ts            # SandAgentRunner type
│   └── runners/
│       ├── base.ts         # Base runner (from benchmark-shared)
│       ├── types.ts        # Runner interfaces
│       ├── claude.ts       # sandagent --runner claude
│       ├── pi.ts           # sandagent --runner pi
│       └── index.ts        # Runner registry
└── package.json

Depends on:
└── @sandagent/benchmark-shared
    ├── types.ts            # GaiaTask, BenchmarkResult
    ├── evaluator.ts        # Answer evaluation
    ├── downloader.ts       # GAIA dataset download
    └── answer-extractor.ts # Extract answers from output
```

## Development

```bash
# Build
pnpm build

# Test
pnpm test
```
