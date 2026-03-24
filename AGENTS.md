# Agent Instructions

You are working on the SandAgent project - a framework that turns powerful coding agents into universal Super Agents.

## Critical Rules

1. **Code & docs language**: Code, comments, documentation, and commit messages MUST be in English (shared convention for the repo).
2. **Chat with the user**: Explanations and discussion may use any language the user prefers; there is no requirement to reply in English only.
3. **Code Quality**: Follow TypeScript best practices and existing code style
4. **Testing**: Write tests for new features when appropriate
5. **Documentation**: Update relevant docs when adding features
6. **Session Changelog**: Continuously update `docs/changelog/YYYY-MM-DD-description.md` throughout the session, documenting each change as it happens

## Project Structure

```
sandagent/
├── apps/
│   ├── web/                 # Documentation website
│   ├── manager-cli/         # Sandbox management CLI
│   └── runner-cli/          # Universal agent runner (claude, pi, codex, copilot)
├── packages/
│   ├── manager/             # Core orchestration
│   ├── runner-claude/       # Claude Agent SDK runtime
│   ├── runner-pi/           # Pi agent runtime
│   ├── sandbox-*/           # Sandbox adapters (e2b, sandock, local, daytona)
│   ├── benchmark/           # GAIA benchmark for testing
│   └── sdk/                 # SDK for product integration
└── templates/               # Agent templates (coder, analyst, researcher)
```

## Key Technologies

- **TypeScript** - Primary language
- **pnpm** - Package manager (monorepo)
- **esbuild** - Bundler for CLI apps
- **vitest** - Testing framework
- **AI SDK** - Vercel AI SDK for streaming

## Development Workflow

1. **Install dependencies**: `pnpm install`
2. **Build all packages**: `pnpm build`
3. **Run tests**: `pnpm test`
4. **Type check**: `pnpm typecheck`

## Runner Architecture

SandAgent supports multiple agent runtimes through a pluggable runner system:

- **runner-claude**: Uses `@anthropic-ai/claude-agent-sdk`
- **runner-pi**: Uses `@mariozechner/pi-coding-agent` (multi-provider)
- **runner-codex**: Planned (OpenAI Codex)
- **runner-copilot**: Planned (GitHub Copilot)

All runners implement the same interface:
```typescript
interface Runner {
  run(userInput: string): AsyncIterable<string>;
}
```

Output format: AI SDK UI stream (NDJSON)

## Adding New Features

### Adding a New Runner

1. Create `packages/runner-{name}/`
2. Implement runner interface
3. Add to `apps/runner-cli/src/runner.ts`
4. Add to benchmark in `packages/benchmark/src/runners/`
5. Update documentation

### Adding Tests

- Unit tests: `src/__tests__/*.test.ts`
- Use vitest
- Mock external dependencies
- Test edge cases

### Environment Variables

See `.env.example` for all configuration options:
- Claude runner: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`
- Pi runner: `GEMINI_API_KEY`, `OPENAI_API_KEY`, etc.
- Sandboxes: `E2B_API_KEY`, `SANDOCK_API_KEY`, `DAYTONA_API_KEY`

## Benchmark Testing

Use GAIA benchmark to test runners:

```bash
# Download dataset
pnpm --filter @sandagent/benchmark-cli benchmark:download

# Run unified benchmark script (from project root)
./run-benchmark.sh --help

# Examples:
./run-benchmark.sh --runner pi --runs 3
./run-benchmark.sh --runner claude --model "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
./run-benchmark.sh --runs 3  # Test both runners

# Results saved to: benchmark-results/sandagent/smoking/
```

**Benchmark script options:**
- `--runner <name>` - Runner to test: pi, claude, both (default: both)
- `--model <name>` - Model to use (overrides default)
- `--runs <n>` - Number of runs per config (default: 1)
- `--dataset <name>` - Dataset: smoking, gaia (default: smoking)

**Working directory:** Tests run in `/tmp/sandagent-benchmark` to avoid creating files in project directory.

## Code Style

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use async/await over promises
- Document public APIs with JSDoc
- Keep functions small and focused
- Use meaningful variable names

## Common Tasks

### Build a specific package
```bash
cd packages/runner-pi
pnpm build
```

### Test runner-cli locally
```bash
cd apps/runner-cli
pnpm build
npx sandagent run --runner pi -- "your task"
```

### Add a dependency
```bash
# To a specific package
pnpm --filter @sandagent/runner-pi add some-package

# To workspace root
pnpm add -w some-package
```

## Important Notes

- Follow existing patterns in the codebase
- Update tests when changing functionality
- Keep dependencies minimal
- Use workspace protocol for internal deps: `"workspace:*"`

## Getting Help

- Check existing code for patterns
- Read package READMEs
- Review test files for usage examples
- Ask for clarification if requirements are unclear

---

**Remember:** Keep **code, docs, and commit messages** in English. **Conversational** replies may follow the user’s language preference.
