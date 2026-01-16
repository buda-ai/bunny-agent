# @sandagent/benchmark

GAIA benchmark runner for comparing agent CLI performance.

## Features

- **Download GAIA benchmark** from Hugging Face
- **Run benchmarks** with multiple agent CLIs:
  - `sandagent` - SandAgent CLI
  - `gemini-cli` - Google Gemini CLI
  - `claudecode` - Anthropic Claude Code CLI
  - `codex-cli` - OpenAI Codex CLI
  - `opencode` - OpenCode CLI (open-source)
- **Compare results** across different agents
- **Filter by level** (1, 2, 3) or category (files, code, search, browser, reasoning)
- **Resume interrupted** benchmark runs
- **Automatic README updates** - Results matrix auto-updates for full benchmark runs
- **Wrong answers tracking** - Track and retry failed tasks
- **Reflection helper** - Improve agent performance with reflection prompts

## Installation

```bash
pnpm add @sandagent/benchmark
```

## CLI Usage

### Download Dataset

Download the GAIA benchmark dataset from Hugging Face:

```bash
# Download validation dataset (default)
sandagent-benchmark download

# Download test dataset
sandagent-benchmark download --dataset test
```

> **Note**: You may need to set `HUGGINGFACE_TOKEN` in your environment for private dataset access.

### Run Benchmark

Run a benchmark with a specific agent:

```bash
# Run with SandAgent on all validation tasks
sandagent-benchmark run --runner sandagent

# Run with Claude Code on Level 1 tasks only
sandagent-benchmark run --runner claudecode --level 1

# Run with Gemini on 10 random tasks
sandagent-benchmark run --runner gemini-cli --limit 10 --random

# Run a specific task with verbose output
sandagent-benchmark run --runner sandagent --task-id abc123 --verbose

# Resume an interrupted benchmark
sandagent-benchmark run --runner sandagent --resume
```

### Compare Results

Compare results across all agents that have been run:

```bash
sandagent-benchmark compare
```

This generates:
- A console table showing accuracy by runner and level
- A JSON report with detailed results
- A Markdown report for documentation

## Options

| Option | Short | Description |
|--------|-------|-------------|
| `--dataset <val>` | `-d` | Dataset: `validation` (default) or `test` |
| `--runner <val>` | `-r` | Agent runner to use |
| `--level <n>` | `-l` | Filter by level (1, 2, or 3) |
| `--category <val>` | `-c` | Filter by category |
| `--limit <n>` | `-n` | Limit number of tasks |
| `--random` | | Run a random single task |
| `--task-id <id>` | `-t` | Run a specific task |
| `--output <dir>` | `-o` | Output directory (default: `./benchmark-results`) |
| `--verbose` | `-v` | Enable verbose output |
| `--resume` | | Resume from checkpoint |
| `--help` | `-h` | Show help |

## Categories

Tasks are automatically categorized based on their content:

| Category | Description |
|----------|-------------|
| `files` | Tasks with file attachments (images, PDFs, etc.) |
| `code` | Tasks requiring code execution or calculations |
| `search` | Tasks requiring web search |
| `browser` | Tasks requiring browser automation |
| `reasoning` | Pure reasoning/logic tasks |

## Programmatic Usage

```typescript
import {
  downloadGaiaDataset,
  runBenchmark,
  compareResults,
  loadAllRunnerResults,
} from "@sandagent/benchmark";

// Download dataset
const tasks = await downloadGaiaDataset("validation");

// Run benchmark with sandagent
const results = await runBenchmark(tasks, "sandagent", {
  dataset: "validation",
  level: 1,
  limit: 10,
  outputDir: "./results",
  verbose: true,
});

// Compare with other runners
const allResults = loadAllRunnerResults("./results", "validation");
const comparison = compareResults(allResults);
```

## Output Format

Results are saved in JSON format:

```json
{
  "metadata": {
    "dataset": "validation",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "total": 50,
    "correct": 35,
    "accuracy": 70.0,
    "runner": "sandagent"
  },
  "results": [
    {
      "taskId": "abc123",
      "question": "What is the capital of France?",
      "level": 1,
      "answer": "Paris",
      "expectedAnswer": "Paris",
      "correct": true,
      "durationMs": 5230
    }
  ]
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HUGGINGFACE_TOKEN` | Hugging Face API token for dataset access |
| `ANTHROPIC_API_KEY` | Required for claudecode runner |
| `OPENAI_API_KEY` | Required for codex-cli runner |
| `GEMINI_API_KEY` | Required for gemini-cli runner (Option 1) |
| `GOOGLE_API_KEY` | Required for gemini-cli with Vertex AI (Option 2) |
| `GOOGLE_GENAI_USE_VERTEXAI` | Set to `true` when using `GOOGLE_API_KEY` |
| `OPENCODE_API_KEY` | Required for opencode runner (if using remote models) |


## Developer Guide

### Setup
```bash
pnpm install && pnpm build
```

### Environment Setup

Create a `.env` file in the project root:

Copy the example file

```bash
cp .env.example .env
```

Add Your API Keys

```bash
# Required for dataset download
HUGGINGFACE_TOKEN=hf_...

# Required for your chosen runner
ANTHROPIC_API_KEY=sk-ant-...    # For claudecode
OPENAI_API_KEY=sk-...           # For codex-cli

# For gemini-cli (choose one option):
# Option 1: Using Gemini API Key
GEMINI_API_KEY=...
# Option 2: Using Vertex AI
GOOGLE_API_KEY=...
GOOGLE_GENAI_USE_VERTEXAI=true
```

### First Run Example

```bash
# Run a random Level 1 task with verbose output
pnpm benchmark:run --runner sandagent --level 1 --random --verbose

# Compare results after running multiple agents
pnpm benchmark:compare
```

> **Note**: Use the appropriate runner after ensuring the required API keys are correctly configured and the corresponding CLI tools are installed.

## Benchmark Results Overview

Overview of benchmark results across different runners and configurations:

- Columns: Different agent runners
- Rows: Different configurations (dataset/level/categories/limit)
- Cells: `Correct/Total (Accuracy%)`, with links to detailed reports (stable links, incrementally updated)

<!-- SANDAGENT_BENCHMARK_MATRIX_BEGIN -->
| Configuration | SandAgent | Claude Code | Gemini CLI | Codex CLI | OpenCode |
|---|---:|---:|---:|---:|---:|
| validation:L1 | [15/53（28.30%）](./benchmark-results/validation-l1-sandagent.json) | [21/53（39.62%）](./benchmark-results/validation-l1-claudecode.json) | [27/53（50.94%）](./benchmark-results/validation-l1-gemini-cli.json) | [39/53（73.58%）](./benchmark-results/validation-l1-codex-cli.json) | [16/53（30.18%）](./benchmark-results/validation-l1-opencode.json) |
| validation:L2 | - | - | [35/86（40.70%）](./benchmark-results/validation-l2-gemini-cli.json) | [52/86（60.47%）](./benchmark-results/validation-l2-codex-cli.json) | - |
| validation:L3 | - | - | - | [15/26（57.69%）](./benchmark-results/validation-l3-codex-cli.json) | - |
| test:L1 | - | - | - | - | - |
| test:L2 | - | - | - | - | - |
| test:L3 | - | - | - | - | - |
<!-- SANDAGENT_BENCHMARK_MATRIX_END -->

> **Note**: The table above is automatically updated by the benchmark runner. Run benchmarks to populate the results.

## License

Apache 2.0
