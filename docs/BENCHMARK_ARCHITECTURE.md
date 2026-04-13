# Benchmark Architecture

## Overview

Bunny Agent benchmark system is split into 3 packages for clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                  @bunny-agent/benchmark                        │
│  Tests native CLIs: claude, gemini, codex                   │
│  Purpose: Compare original agent CLIs                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ depends on
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              @bunny-agent/benchmark-shared                     │
│  Core logic: GAIA dataset, evaluation, types                │
│  Shared by both benchmark packages                          │
└─────────────────────────┬───────────────────────────────────┘
                          ↑
                          │ depends on
                          │
┌─────────────────────────────────────────────────────────────┐
│            @bunny-agent/benchmark-bunny-agent                    │
│  Tests bunny-agent CLI: --runner claude, --runner pi          │
│  Purpose: Test bunny-agent's runner implementations           │
└─────────────────────────────────────────────────────────────┘
```

## Package Responsibilities

### @bunny-agent/benchmark-shared

**Core benchmark logic + Multiple datasets** - shared by both benchmark packages.

**Datasets:**
1. **GAIA Benchmark** - General AI Assistant
   - Download from Hugging Face
   - Validation and test sets
   - 3 difficulty levels
   - Multiple categories

2. **SWE-bench Lite** - Software Engineering (TODO)
   - Real-world GitHub issues
   - Code editing and bug fixing
   - Test-driven evaluation

3. **Smoking Coding Benchmark** - Quick validation (NEW)
   - 5 fast tests (~30s total)
   - File, bash, code, reasoning
   - Perfect for CI/CD

**Exports:**
- `GaiaTask`, `SmokingTask`, `SWEBenchTask` types
- `downloadGaiaDataset()` - Download GAIA benchmark
- `getAllSmokingTests()` - Get smoking tests
- `evaluateAnswer()` - Compare answer with ground truth
- `extractAnswer()` - Extract answer from agent output

**No CLI** - pure library package.

### @bunny-agent/benchmark-cli

**Tests native agent CLIs** directly.

**Tests native agent CLIs** directly.

**Runners:**
- `claudecode` → `claude -p "task"`
- `gemini-cli` → `gemini -p "task"`
- `codex-cli` → `codex -p "task"`
- `opencode` → `opencode -p "task"`

**Purpose:**
- Benchmark original agent CLIs
- Establish baseline performance
- Compare different agent architectures

**CLI:** `bunny-agent-benchmark` (for native CLIs)

### @bunny-agent/benchmark-bunny-agent

**Tests bunny-agent CLI** with different runners.

**Runners:**
- `claude` → `bunny-agent run --runner claude -- "task"`
- `pi` → `bunny-agent run --runner pi -- "task"`
- `codex` → `bunny-agent run --runner codex -- "task"`
- `copilot` → `bunny-agent run --runner copilot -- "task"`

**Purpose:**
- Test bunny-agent's runner implementations
- Measure bunny-agent overhead vs native CLIs
- Validate runner compatibility

**CLI:** `bunny-agent-benchmark` (for bunny-agent runners)

## Smoking Coding Benchmark

Quick validation tests for fast feedback (NEW in benchmark-shared):

| Test ID | Name | Category | Description | Expected | Timeout |
|---------|------|----------|-------------|----------|---------|
| smoke-001 | Create Hello World | file | Create hello.txt | "Hello, World!" | 30s |
| smoke-002 | Simple Math | reasoning | Calculate 123 + 456 | "579" | 30s |
| smoke-003 | List Files | bash | List .txt files | /\.txt/ | 30s |
| smoke-004 | Write Python Script | code | Create Python script | /print.*Hello/ | 30s |
| smoke-005 | JSON Parse | reasoning | Parse JSON | "test" | 30s |

**Total runtime: ~30 seconds**

**Use cases:**
- ✅ Quick validation after code changes
- ✅ CI/CD smoke tests
- ✅ Runner compatibility checks
- ✅ Fast feedback loop during development

**Usage:**
```typescript
import { getAllSmokingTests, getSmokingTest } from "@bunny-agent/benchmark-shared";

// Get all tests
const tests = getAllSmokingTests(); // 5 tests

// Get specific test
const test = getSmokingTest("smoke-001");

// Get by category
const fileTests = getSmokingTestsByCategory("file");
```

## Usage Comparison

### Native CLI Benchmark

```bash
cd packages/benchmark-cli

# Download GAIA dataset
pnpm benchmark:download

# Run smoking tests (fast validation)
pnpm benchmark:run -- --runner claudecode --dataset smoking --verbose

# Test native CLIs with GAIA
pnpm benchmark:run -- --runner claudecode --level 1 --limit 10
pnpm benchmark:run -- --runner gemini-cli --level 1 --limit 10

# Compare
pnpm benchmark:compare
```

### Bunny Agent Runner Benchmark

```bash
cd packages/benchmark-bunny-agent

# Download dataset (uses shared package)
pnpm benchmark:download

# Run smoking tests (fast validation)
pnpm benchmark:run -- --runner claude --dataset smoking --verbose

# Test bunny-agent runners with GAIA
pnpm benchmark:run -- --runner claude --level 1 --limit 10
pnpm benchmark:run -- --runner pi --level 1 --limit 10

# Compare
pnpm benchmark:compare
```

## Performance Analysis

With this architecture, you can:

1. **Compare native CLIs** (benchmark)
   - Which agent CLI is fastest?
   - Which has best accuracy?

2. **Compare bunny-agent runners** (benchmark-bunny-agent)
   - Does bunny-agent add overhead?
   - Are runners compatible with GAIA tasks?

3. **Compare native vs bunny-agent** (cross-package)
   - `claude` CLI vs `bunny-agent --runner claude`
   - Measure bunny-agent's abstraction cost

## File Structure

```
packages/
├── benchmark-shared/
│   ├── src/
│   │   ├── types.ts              # Shared types
│   │   ├── evaluator.ts          # Answer evaluation
│   │   ├── answer-extractor.ts   # Extract answers
│   │   ├── datasets/
│   │   │   ├── gaia.ts           # GAIA benchmark
│   │   │   ├── swe-bench.ts      # SWE-bench Lite (TODO)
│   │   │   ├── smoking.ts        # Smoking tests (NEW)
│   │   │   └── index.ts
│   │   └── index.ts
│   └── package.json
│
├── benchmark-cli/
│   ├── src/
│   │   ├── cli.ts                # CLI entry point
│   │   ├── runner.ts             # Benchmark execution
│   │   ├── compare.ts            # Result comparison
│   │   ├── types.ts              # AgentRunner type
│   │   └── runners/
│   │       ├── claudecode.ts     # claude CLI
│   │       ├── gemini-cli.ts     # gemini CLI
│   │       ├── codex-cli.ts      # codex CLI
│   │       └── index.ts
│   └── package.json
│
└── benchmark-bunny-agent/
    ├── src/
    │   ├── cli.ts                # CLI entry point
    │   ├── runner.ts             # Benchmark execution
    │   ├── compare.ts            # Result comparison
    │   ├── types.ts              # Bunny AgentRunner type
    │   └── runners/
    │       ├── claude.ts         # bunny-agent --runner claude
    │       ├── pi.ts             # bunny-agent --runner pi
    │       ├── codex.ts          # bunny-agent --runner codex
    │       └── index.ts
    └── package.json
```

## Benefits

✅ **Clear Separation**
- Native CLI testing vs bunny-agent runner testing
- No confusion about what's being tested

✅ **Shared Core Logic**
- GAIA dataset handling in one place
- Evaluation logic consistent across both

✅ **Independent Versioning**
- Can update native CLI tests without affecting bunny-agent tests
- Can add new bunny-agent runners independently

✅ **Performance Comparison**
- Easy to compare native vs bunny-agent
- Measure abstraction overhead

✅ **Maintainability**
- Each package has clear responsibility
- Shared code in benchmark-shared reduces duplication

## Future Enhancements

- [ ] Add more native CLI runners (aider, cursor, etc.)
- [ ] Add more bunny-agent runners (codex, copilot)
- [ ] Cross-package comparison tool
- [ ] Performance regression tracking
- [ ] CI/CD integration for both benchmarks
