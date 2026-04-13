# @bunny-agent/runner-cli

Bunny Agent Runner CLI - A **lightweight, local** command-line interface for running AI agents in your terminal.

Like gemini-cli, claude-code, or codex-cli, this tool runs **directly on your local filesystem** and streams AI SDK UI messages to stdout.

## 🎯 Key Features

- 🔌 **Choose Different Runners**: Switch between Claude, Codex, Gemini, Copilot with `--runner` flag
- 🚀 **Local Execution**: Runs directly on your filesystem, no sandbox required
- 💨 **Lightweight**: No manager dependency, minimal overhead
- 📡 **Streaming**: Real-time AI SDK UI streaming

## 📐 Architecture

```
runner-cli → runner-* (direct, NO dependencies on manager or sandbox)
             ├─ runner-claude ✅
             ├─ runner-codex ✅
             ├─ runner-gemini ✅
             └─ runner-copilot 🚧

Dependencies:
✅ @bunny-agent/runner-claude (runtime)
✅ @bunny-agent/runner-codex (runtime)
✅ @bunny-agent/runner-gemini (runtime)
❌ NO @bunny-agent/manager
❌ NO @bunny-agent/sandbox-*
```

**Difference from manager-cli:**
- `runner-cli`: Local filesystem, no isolation, lightweight, direct runner usage
- `manager-cli`: Sandboxed execution, uses manager + sandbox adapters + runner

## Installation

```bash
# Global install (recommended if you want the `bunny-agent` command)
npm install -g @bunny-agent/runner-cli@latest

# Or add to a project
npm install @bunny-agent/runner-cli@latest
```

## Usage

```bash
bunny-agent run [options] -- "<user input>"
```

Without installing globally, you can also run it via `npx`:

```bash
npx -y @bunny-agent/runner-cli@latest run -- "Create a hello world script"
```

### Basic Examples

```bash
# Using Claude (default)
bunny-agent run -- "Create a hello world script"

# Explicitly choose Claude
bunny-agent run --runner claude -- "Create a hello world script"

# Using Codex
bunny-agent run --runner codex -- "Build a REST API with Express"

# Using Gemini
bunny-agent run --runner gemini -- "Build a REST API with Express"

# Using GitHub Copilot (when implemented)
bunny-agent run --runner copilot -- "Refactor this code"

# With custom system prompt
bunny-agent run --runner claude --system-prompt "You are a coding assistant" -- "Build a REST API with Express"
```

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--runner <runner>` | `-r` | Runner to use: `claude`, `codex`, `gemini`, `opencode`, `copilot`, `pi` | `claude` |
| `--model <model>` | `-m` | Model to use | `claude-sonnet-4-20250514` |
| `--cwd <path>` | `-c` | Working directory | Current directory |
| `--system-prompt <prompt>` | `-s` | Custom system prompt | - |
| `--max-turns <n>` | `-t` | Maximum conversation turns | - |
| `--allowed-tools <tools>` | `-a` | Comma-separated list of allowed tools | - |
| `--resume <session-id>` | `-r` | Resume a previous session | - |
| `--help` | `-h` | Show help message | - |

## Output Format

`bunny-agent run` always outputs AI SDK data stream (SSE) format.

```bash
bunny-agent run -- "Calculate 2+2"
```

**Output:**
```
data: {"type":"start","messageId":"msg_123"}
data: {"type":"text-delta","id":"text_1","delta":"The answer is 4."}
data: [DONE]
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude runner) | No |
| `OPENAI_API_KEY` or `CODEX_API_KEY` | OpenAI API key (Codex runner) | No |
| `GEMINI_API_KEY` | Gemini API key (Gemini runner) | No |
| `BUNNY_AGENT_WORKSPACE` | Default workspace path | No |
| `BUNNY_AGENT_LOG_LEVEL` | Logging level (debug, info, warn, error) | No |

## Advanced Examples

### Specify Working Directory

```bash
bunny-agent run --cwd ./my-project -- "Fix the bug in main.ts"
```

### Combined Options

```bash
bunny-agent run \
  -m claude-sonnet-4-20250514 \
  --system-prompt "You are a helpful coding assistant" \
  --max-turns 10 \
  -- "Build a REST API"
```

## Architecture

The CLI is designed to:
1. Execute in a specific working directory
2. Load settings from `.claude/settings.json` and `CLAUDE.md` in the project
3. Stream AI SDK UI messages directly to stdout
4. Output AI SDK data stream (SSE) format

## 🐳 Docker Image Build

Build Docker images with agent templates baked in:

```bash
# Build image
bunny-agent image build --name vikadata/bunny-agent-seo --tag 0.1.0 --template ./templates/seo-agent

# Build and push
bunny-agent image build --name vikadata/bunny-agent-seo --tag 0.1.0 --template ./templates/seo-agent --push

# Without template
bunny-agent image build --name vikadata/bunny-agent --tag 0.1.0
```

### Image Build Options

| Option | Description | Default |
|--------|-------------|---------|
| `--name <name>` | Full image name (e.g. `vikadata/bunny-agent-seo`) | `bunny-agent` |
| `--tag <tag>` | Image tag | `latest` |
| `--image <full>` | Full image name override (e.g. `myorg/myimage:v1`) | - |
| `--platform <plat>` | Build platform | `linux/amd64` |
| `--template <path>` | Path to agent template directory | - |
| `--push` | Push image to registry after build | `false` |

## Related Documentation

- [Skills](docs/SKILLS.md) — Where skills live and how they are loaded (local and Docker)
- [Claude Agent SDK](https://platform.claude.com/docs/agent-sdk/typescript)
- [AI SDK UI Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
