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

## Contributors
- Implementation: 2026-03-05
- Testing: OpenAI gpt-4.1-mini via LiteLLM proxy
- Environment: Linux, Node.js v24.12.0, pnpm v10.11.0
