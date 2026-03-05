# @sandagent/benchmark-shared

Shared benchmark infrastructure for SandAgent.

## Purpose

Provides core benchmark logic shared by:
- `@sandagent/benchmark-cli` - Tests native agent CLIs
- `@sandagent/benchmark-sandagent` - Tests sandagent runners

## Features

### Multiple Benchmark Datasets

1. **GAIA Benchmark** - General AI Assistant benchmark
   - Download from Hugging Face
   - Validation and test sets
   - 3 difficulty levels
   - Multiple categories (files, code, search, reasoning)

2. **SWE-bench Lite** - Software Engineering benchmark
   - Real-world GitHub issues
   - Code editing and bug fixing
   - Test-driven evaluation
   - TODO: Implementation pending

3. **Smoking Coding Benchmark** - Quick validation tests
   - 5 fast tests for basic capabilities
   - File operations, bash, code, reasoning
   - ~30 seconds total runtime
   - Perfect for quick validation

### Core Evaluation Logic

- Answer extraction from agent output
- Answer comparison with ground truth
- Result scoring and reporting
- Shared types and interfaces

## Usage

```typescript
import {
  // Datasets
  downloadGaiaDataset,
  getAllSmokingTests,
  downloadSWEBenchLite,
  
  // Evaluation
  evaluateAnswer,
  extractAnswer,
  
  // Types
  GaiaTask,
  SmokingTask,
  SWEBenchTask,
  BenchmarkResult,
} from "@sandagent/benchmark-shared";

// Download GAIA
await downloadGaiaDataset("validation");

// Get smoking tests
const tests = getAllSmokingTests();

// Evaluate answer
const result = evaluateAnswer(answer, expectedAnswer);
```

## Datasets

### GAIA Benchmark

```typescript
// Download
await downloadGaiaDataset("validation");

// Load tasks
const tasks = await loadGaiaTasks("validation", { level: 1 });
```

### Smoking Benchmark

```typescript
// Get all tests
const tests = getAllSmokingTests();

// Get by category
const fileTests = getSmokingTestsByCategory("file");

// Get by ID
const test = getSmokingTest("smoke-001");
```

### SWE-bench Lite

```typescript
// TODO: Implementation pending
await downloadSWEBenchLite();
const tasks = await loadSWEBenchTasks();
```

## Architecture

```
@sandagent/benchmark-shared/
├── src/
│   ├── types.ts              # Shared types
│   ├── evaluator.ts          # Answer evaluation
│   ├── answer-extractor.ts   # Extract answers
│   ├── datasets/
│   │   ├── gaia.ts           # GAIA benchmark
│   │   ├── swe-bench.ts      # SWE-bench Lite
│   │   ├── smoking.ts        # Smoking tests
│   │   └── index.ts
│   └── index.ts
└── package.json
```

## Smoking Tests

Quick validation tests (5 tests, ~30s total):

| ID | Name | Category | Description |
|----|------|----------|-------------|
| smoke-001 | Create Hello World | file | Create hello.txt |
| smoke-002 | Simple Math | reasoning | Calculate 123 + 456 |
| smoke-003 | List Files | bash | List .txt files |
| smoke-004 | Write Python Script | code | Create Python script |
| smoke-005 | JSON Parse | reasoning | Parse JSON |

Perfect for:
- ✅ Quick validation after changes
- ✅ CI/CD smoke tests
- ✅ Runner compatibility checks
- ✅ Fast feedback loop

## Development

```bash
# Build
pnpm build

# Test
pnpm test
```
