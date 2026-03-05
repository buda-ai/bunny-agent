# Benchmark Results

This directory contains benchmark results from different test suites.

## Directory Structure

```
benchmark-results/
├── cli/                    # Results from @sandagent/benchmark-cli
│   └── smoking/            # Smoking benchmark results
│       └── cli-{agent}-{model}-{date}-{time}.json
│
└── sandagent/              # Results from @sandagent/benchmark-sandagent
    └── smoking/            # Smoking benchmark results
        └── sandagent-{runner}-{model}-{date}-{time}.json
```

## Filename Format

### CLI Benchmarks (Native Agent CLIs)

Format: `cli-{agent}-{model}-{date}-{time}.json`

Examples:
- `cli-claudecode-claude-sonnet-4-2026-03-05-14-30-45.json`
- `cli-gemini-cli-gemini-2.5-flash-2026-03-05-14-35-12.json`

### SandAgent Benchmarks (sandagent --runner X)

Format: `sandagent-{runner}-{model}-{date}-{time}.json`

Examples:
- `sandagent-pi-openai-gpt-4.1-mini-2026-03-05-20-41-14.json`
- `sandagent-claude-claude-sonnet-4-2026-03-05-14-30-45.json`

## Result File Structure

```json
{
  "benchmarkType": "sandagent",  // or "cli"
  "runner": "pi",                 // or agent name for CLI
  "model": "openai:gpt-4.1-mini",
  "timestamp": "2026-03-05T12:38:45.726Z",
  "summary": {
    "total": 5,
    "passed": 2,
    "failed": 3,
    "successRate": 40,
    "totalTimeMs": 15172,
    "totalTimeSec": 15.172
  },
  "results": [
    {
      "taskId": "smoke-001",
      "success": false,
      "durationMs": 1440,
      "answer": "...",
      "error": "..."
    }
  ]
}
```

## Comparison

### CLI vs SandAgent

Compare native agent CLIs vs sandagent's runner implementations:

| Benchmark Type | Tests | Purpose |
|----------------|-------|---------|
| **cli/** | Native CLIs (claude, gemini, codex) | Baseline performance of original agents |
| **sandagent/** | sandagent --runner X | Performance of sandagent's runner wrappers |

### Example Comparison

```bash
# CLI benchmark (native claude)
cli-claudecode-claude-sonnet-4-2026-03-05-14-30-45.json
  → Tests: claude CLI directly
  → Purpose: Baseline performance

# SandAgent benchmark (sandagent --runner claude)
sandagent-claude-claude-sonnet-4-2026-03-05-14-30-45.json
  → Tests: sandagent run --runner claude
  → Purpose: Measure sandagent overhead
```

## Running Benchmarks

### CLI Benchmarks

```bash
cd packages/benchmark-cli
pnpm benchmark:run -- --runner claudecode --dataset smoking
```

Results saved to: `benchmark-results/cli/smoking/`

### SandAgent Benchmarks

```bash
cd packages/benchmark-sandagent
AI_MODEL="openai:gpt-4.1-mini" node dist/cli.js run --runner pi
```

Results saved to: `benchmark-results/sandagent/smoking/`

## Analysis

To analyze results:

```bash
# View all sandagent results
cd benchmark-results/sandagent/smoking
for f in *.json; do
  echo "=== $f ==="
  jq '{runner, model, summary}' "$f"
done

# Compare success rates
jq -s 'map({runner, model, successRate: .summary.successRate}) | sort_by(.successRate) | reverse' *.json
```

## Benchmark Types

### Smoking Benchmark

- **Tests:** 5 quick validation tests
- **Runtime:** ~30 seconds
- **Categories:** file, bash, code, reasoning
- **Purpose:** Fast validation, CI/CD smoke tests

### GAIA Benchmark (TODO)

- **Tests:** 165 comprehensive tasks
- **Runtime:** Hours
- **Levels:** 1, 2, 3 (difficulty)
- **Purpose:** Comprehensive evaluation

### SWE-bench Lite (TODO)

- **Tests:** 300 software engineering tasks
- **Runtime:** Hours
- **Purpose:** Code editing and bug fixing
