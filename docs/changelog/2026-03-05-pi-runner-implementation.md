# 2026-03-05 - Pi Runner Implementation

## Summary
Implemented Pi runner for SandAgent, enabling multi-provider LLM support (OpenAI, Google, Anthropic, etc.) through the Pi coding agent framework.

## Changes

### New Packages
- **packages/runner-pi/** - Pi agent runtime implementation
  - Uses `@mariozechner/pi-coding-agent` for full coding tools (read, write, edit, bash)
  - Supports custom base URLs for LiteLLM proxies
  - Outputs AI SDK UI stream format

### Modified Files
- **apps/runner-cli/src/cli.ts** - Added "pi" to runner options
- **apps/runner-cli/src/runner.ts** - Added Pi runner case
- **apps/runner-cli/package.json** - Added Pi dependencies
- **packages/benchmark/src/runners/pi.ts** - Added Pi to GAIA benchmark
- **packages/benchmark/src/types.ts** - Added "pi" to AgentRunner type
- **packages/benchmark/src/runners/index.ts** - Registered Pi runner
- **packages/benchmark/src/readme-updater.ts** - Added Pi column mapping
- **packages/benchmark/src/cli.ts** - Updated help text

### Documentation
- **.env.example** - Added Pi runner API keys (GEMINI_API_KEY, OPENAI_API_KEY, etc.)
- **AGENTS.md** - Created English-only project instructions
- **CLAUDE.md** - Symlink to AGENTS.md for Claude Code
- **RUNNER_PI_IMPLEMENTATION.md** - Implementation details
- **PI_RUNNER_TEST_RESULTS.md** - Test results with OpenAI via LiteLLM
- **PI_RUNNER_BENCHMARK.md** - Benchmark integration guide

### Directory Structure
- **spec/** → **docs/** - Renamed for clarity
- **docs/changelog/** - Created for session changelogs

## Features

### Pi Runner Capabilities
- ✅ Multi-provider support (OpenAI, Google, Anthropic, Azure, etc.)
- ✅ Custom base URL support (LiteLLM proxies)
- ✅ Full coding tools (read, write, edit, bash)
- ✅ Streaming text output
- ✅ Tool execution tracking
- ✅ GAIA benchmark integration

### Usage
```bash
# Run with OpenAI
npx sandagent run --runner pi -m "openai:gpt-4.1-mini" -- "your task"

# Run with Google Gemini
npx sandagent run --runner pi -m "google:gemini-2.5-flash-lite-preview-06-17" -- "your task"

# Run benchmark
pnpm --filter @sandagent/benchmark benchmark:run -- --runner pi --level 1 --limit 1
```

## Testing

### Manual Tests
- ✅ Simple conversation with OpenAI via LiteLLM proxy
- ✅ File creation with write tool
- ✅ Streaming output verification

### Test Results
```
Model: openai:gpt-4.1-mini (via LiteLLM proxy)
Task: Create file with content
Result: ✅ Success
- Tool call: write(path="pi-with-tools-test.txt", content="Hello from Pi runner with tools!")
- File created: 32 bytes
- Response: Streaming text output working correctly
```

## Environment Configuration

### Required Variables
```bash
# For OpenAI models
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://your-proxy.com  # Optional

# For Google Gemini models
GEMINI_API_KEY=your-key

# For Anthropic models (via Pi)
ANTHROPIC_API_KEY=your-key
ANTHROPIC_BASE_URL=https://your-proxy.com  # Optional
```

## Architecture

### Runner Interface
```typescript
interface PiRunner {
  run(userInput: string): AsyncIterable<string>;
}

// Factory function
function createPiRunner(options: PiRunnerOptions): PiRunner
```

### Event Flow
```
User Input
  ↓
Pi Agent (with coding tools)
  ↓
Event Stream (message_update, tool_execution_start, tool_execution_end)
  ↓
AI SDK UI Format (0:text, 9:tool_call, a:tool_result, d:finish)
  ↓
stdout
```

## Comparison: Claude vs Pi Runner

| Feature | Claude Runner | Pi Runner |
|---------|--------------|-----------|
| Provider | Anthropic only | Multi-provider ✅ |
| Tools | Built-in | Built-in ✅ |
| Streaming | ✅ | ✅ |
| Proxy Support | ✅ | ✅ |
| Setup | Complex SDK | Simple API ✅ |

## Known Issues

### Development Environment
- Pi runner requires `sandagent` command in PATH for benchmark detection
- Workaround: `cd apps/runner-cli && npm link`

### Future Improvements
- [ ] Add more tool configurations
- [ ] Add MCP server support
- [ ] Add skills system integration
- [ ] Performance benchmarking vs Claude runner

## References
- Pi Coding Agent: https://github.com/badlogic/pi-mono
- GAIA Benchmark: https://huggingface.co/gaia-benchmark
- AI SDK: https://sdk.vercel.ai/

## Benchmark Architecture Refactor

### Package Rename
- **packages/benchmark** → **packages/benchmark-cli**
  - Clarifies purpose: tests native coding agent CLIs
  - Examples: `claude`, `gemini`, `codex` CLIs

### New Structure
Split benchmark into 3 packages for clarity:

1. **@sandagent/benchmark-shared** - Core logic + Multiple datasets
   - **GAIA Benchmark** - General AI Assistant (existing)
   - **SWE-bench Lite** - Software Engineering tasks (TODO)
   - **Smoking Coding Benchmark** - 5 quick validation tests (NEW)
   - Answer evaluation
   - Answer extraction
   - Shared types

2. **@sandagent/benchmark-cli** - Native CLI testing
   - Tests: `claude`, `gemini`, `codex` CLIs directly
   - Purpose: Compare original agent CLIs

3. **@sandagent/benchmark-sandagent** - SandAgent runner testing
   - Tests: `sandagent --runner claude`, `sandagent --runner pi`, etc.
   - Purpose: Test sandagent's runner implementations
   - Measures sandagent overhead

### Smoking Coding Benchmark

Quick validation tests for fast feedback:

| Test | Category | Description | Timeout |
|------|----------|-------------|---------|
| smoke-001 | file | Create hello.txt | 30s |
| smoke-002 | reasoning | Calculate 123 + 456 | 30s |
| smoke-003 | bash | List .txt files | 30s |
| smoke-004 | code | Write Python script | 30s |
| smoke-005 | reasoning | Parse JSON | 30s |

**Total runtime: ~30 seconds**

Perfect for:
- ✅ Quick validation after changes
- ✅ CI/CD smoke tests
- ✅ Runner compatibility checks
- ✅ Fast feedback loop

### Smoking Benchmark Implementation

Created `@sandagent/benchmark-sandagent` package to run smoking tests:

```bash
cd packages/benchmark-sandagent

# Run smoking benchmark
AI_MODEL="openai:gpt-4o-mini" \
OPENAI_API_KEY=xxx \
OPENAI_BASE_URL=https://llm.bika.ltd \
node dist/cli.js run --runner pi

# Output:
🏖️  Running Smoking Benchmark with sandagent --runner pi
📊 Total tests: 5

🧪 [smoke-001] Create Hello World (file)
   ✅ PASS (5.2s)

🧪 [smoke-002] Simple Math (reasoning)
   ✅ PASS (3.1s)

...

📈 Summary:
   ✅ Passed: 5/5
   ❌ Failed: 0/5
   ⏱️  Total time: 28.3s
   📊 Success rate: 100.0%
```

**Features:**
- ✅ Runs 5 quick tests
- ✅ Tests file, bash, code, reasoning
- ✅ Passes env vars to sandagent
- ✅ Pretty output with emojis
- ✅ Summary statistics

### Benefits
- ✅ Clear separation: native CLIs vs sandagent runners
- ✅ Shared core logic (no duplication)
- ✅ Multiple benchmark datasets
- ✅ Fast smoking tests for quick validation
- ✅ Can compare native vs sandagent performance
- ✅ Independent versioning

### Package Structure
```
packages/
├── benchmark-shared/       # Core logic + datasets (GAIA, SWE-bench, Smoking)
├── benchmark-cli/          # Native CLI benchmark (claude, gemini, codex)
└── benchmark-sandagent/    # SandAgent runner benchmark (--runner X)
```

## Contributors
- Implementation: 2026-03-05
- Testing: OpenAI gpt-4.1-mini via LiteLLM proxy
- Environment: Linux, Node.js v24.12.0, pnpm v10.11.0


## Benchmark Results Organization

Results are now organized by benchmark type for clarity:

```
benchmark-results/
├── cli/                    # Native agent CLI results
│   └── smoking/
│       └── cli-{agent}-{model}-{date}-{time}.json
│
└── sandagent/              # sandagent runner results
    └── smoking/
        └── sandagent-{runner}-{model}-{date}-{time}.json
```

**Filename format:**
- CLI: `cli-claudecode-claude-sonnet-4-2026-03-05-14-30-45.json`
- SandAgent: `sandagent-pi-openai-gpt-4.1-mini-2026-03-05-20-41-14.json`

**Result structure:**
```json
{
  "benchmarkType": "sandagent",
  "runner": "pi",
  "model": "openai:gpt-4.1-mini",
  "timestamp": "2026-03-05T12:41:14.726Z",
  "summary": {
    "total": 5,
    "passed": 2,
    "successRate": 40,
    "totalTimeMs": 14300
  },
  "results": [...]
}
```

**Example results:**
- sandagent-pi-openai-gpt-4.1-mini-2026-03-05-20-41-14.json: 2/5 passed (40%)
- Runtime: ~14 seconds

## Environment Configuration

All packages now use the root `.env` file. Removed redundant `.env.example` files from:
- ❌ `docker/sandagent-claude/.env.example` (deleted)
- ❌ `packages/benchmark-cli/.env.example` (deleted)
- ✅ `.env.example` (root - single source of truth)


## Answer Extraction Fix

Fixed answer extraction in benchmark results to show clean text instead of raw shell output.

**Before:**
```json
{
  "answer": "[dotenv@17.3.1] injecting env...\n0:\"123 + 456 = 579\"\nd:{\"finishReason\":\"stop\"}"
}
```

**After:**
```json
{
  "answer": "The result of 123 + 456 is 579."
}
```

**Changes:**
- Fixed `pi.ts` runner to parse AI SDK UI format (`0:"text"` lines)
- Skip dotenv and runner logs
- Extract final text chunk from streaming output
- Unescape JSON strings properly

**Result quality:**
- ✅ Clean, human-readable answers
- ✅ No shell output noise
- ✅ Proper text extraction from streaming format


## Unified Benchmark Script

Created `run-benchmark.sh` in project root as the single entry point for all benchmarks.

**Features:**
- ✅ Loads `.env` automatically (with error check)
- ✅ Configurable default models at top of script
- ✅ Runs in `/tmp/sandagent-benchmark` (no project pollution)
- ✅ Supports both pi and claude runners
- ✅ Multiple runs support
- ✅ Full output display

**Usage:**
```bash
# Edit default models in run-benchmark.sh:
DEFAULT_PI_MODEL="openai:gpt-5.2"
DEFAULT_CLAUDE_MODEL="global.anthropic.claude-sonnet-4-5-20250929-v1:0"

# Run benchmarks
./run-benchmark.sh --runner pi --runs 3
./run-benchmark.sh --runner claude --runs 3
./run-benchmark.sh --runs 2  # Both runners
```

**Fixes:**
- Fixed working directory to `/tmp/sandagent-benchmark`
- Fixed result save path using `PROJECT_ROOT` env var
- Removed old scattered benchmark scripts
- Updated AGENTS.md with unified script documentation

**Model name format:**
- Pi runner: `openai:gpt-5.2` (provider:model)
- Claude runner: `global.anthropic.claude-sonnet-4-5-20250929-v1:0`
