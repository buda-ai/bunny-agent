# Benchmark Datasets

## Overview

SandAgent supports multiple benchmark datasets for different testing needs:

| Dataset | Purpose | Size | Runtime | Status |
|---------|---------|------|---------|--------|
| **GAIA** | General AI Assistant | 165 tasks | Hours | ✅ Ready |
| **SWE-bench Lite** | Software Engineering | 300 tasks | Hours | 🚧 TODO |
| **Smoking** | Quick validation | 5 tasks | 30s | ✅ Ready |

## GAIA Benchmark

**Purpose:** Comprehensive evaluation of general AI assistant capabilities

**Features:**
- 3 difficulty levels (1, 2, 3)
- Multiple categories: files, code, search, browser, reasoning
- Validation and test sets
- Real-world tasks

**Usage:**
```bash
# Download
pnpm benchmark:download --dataset validation

# Run
pnpm benchmark:run -- --runner claude --level 1 --limit 10
```

**Source:** https://huggingface.co/gaia-benchmark

## SWE-bench Lite

**Purpose:** Software engineering tasks with real GitHub issues

**Features:**
- Real-world bug fixes
- Code editing challenges
- Test-driven evaluation
- Repository context

**Status:** 🚧 TODO - Implementation pending

**Source:** https://www.swebench.com/

## Smoking Coding Benchmark

**Purpose:** Fast validation of basic coding agent capabilities

**Features:**
- 5 quick tests (~30 seconds total)
- Covers core capabilities: file, bash, code, reasoning
- Perfect for CI/CD
- Instant feedback

**Tests:**

### smoke-001: Create Hello World
- **Category:** file
- **Task:** Create a file named hello.txt with content 'Hello, World!'
- **Expected:** "Hello, World!"
- **Timeout:** 30s

### smoke-002: Simple Math
- **Category:** reasoning
- **Task:** Calculate 123 + 456 and return the result
- **Expected:** "579"
- **Timeout:** 30s

### smoke-003: List Files
- **Category:** bash
- **Task:** List all .txt files in the current directory
- **Expected:** /\.txt/
- **Timeout:** 30s

### smoke-004: Write Python Script
- **Category:** code
- **Task:** Create a Python script that prints 'Hello from Python'
- **Expected:** /print.*Hello from Python/
- **Timeout:** 30s

### smoke-005: JSON Parse
- **Category:** reasoning
- **Task:** Parse this JSON and return the 'name' field: {"name":"test","value":42}
- **Expected:** "test"
- **Timeout:** 30s

**Usage:**
```typescript
import { getAllSmokingTests, getSmokingTest } from "@sandagent/benchmark-shared";

// Get all tests
const tests = getAllSmokingTests(); // 5 tests

// Get specific test
const test = getSmokingTest("smoke-001");

// Get by category
const fileTests = getSmokingTestsByCategory("file");
```

**CLI Usage:**
```bash
# Run smoking tests
pnpm benchmark:run -- --runner claude --dataset smoking --verbose

# Should complete in ~30 seconds
```

## When to Use Each Dataset

### Use GAIA when:
- ✅ Comprehensive evaluation needed
- ✅ Comparing different agents
- ✅ Publishing benchmark results
- ✅ Testing across difficulty levels

### Use SWE-bench Lite when:
- ✅ Testing code editing capabilities
- ✅ Evaluating bug fixing skills
- ✅ Real-world software engineering tasks
- ⚠️ TODO: Not yet implemented

### Use Smoking when:
- ✅ Quick validation after changes
- ✅ CI/CD smoke tests
- ✅ Fast feedback during development
- ✅ Runner compatibility checks
- ✅ Pre-deployment validation

## Implementation

All datasets are in `@sandagent/benchmark-shared`:

```
packages/benchmark-shared/src/datasets/
├── gaia.ts           # GAIA benchmark (ready)
├── swe-bench.ts      # SWE-bench Lite (TODO)
├── smoking.ts        # Smoking tests (ready)
└── index.ts          # Exports all datasets
```

## Adding New Datasets

To add a new dataset:

1. Create `packages/benchmark-shared/src/datasets/your-dataset.ts`
2. Define task interface and loader functions
3. Export from `datasets/index.ts`
4. Update this documentation
5. Add CLI support in benchmark packages

Example:
```typescript
// your-dataset.ts
export interface YourTask {
  id: string;
  description: string;
  expectedOutput: string;
}

export async function loadYourTasks(): Promise<YourTask[]> {
  // Implementation
}
```
