# @sandagent/runner-cli

SandAgent Runner CLI - A **lightweight, local** command-line interface for running AI agents in your terminal.

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
✅ @sandagent/runner-claude (runtime)
✅ @sandagent/runner-codex (runtime)
✅ @sandagent/runner-gemini (runtime)
❌ NO @sandagent/manager
❌ NO @sandagent/sandbox-*
```

**Difference from manager-cli:**
- `runner-cli`: Local filesystem, no isolation, lightweight, direct runner usage
- `manager-cli`: Sandboxed execution, uses manager + sandbox adapters + runner

## Installation

```bash
# Global install (recommended if you want the `sandagent` command)
npm install -g @sandagent/runner-cli@latest

# Or add to a project
npm install @sandagent/runner-cli@latest
```

## Usage

```bash
sandagent run [options] -- "<user input>"
```

Without installing globally, you can also run it via `npx`:

```bash
npx -y @sandagent/runner-cli@latest run -- "Create a hello world script"
```

### Basic Examples

```bash
# Using Claude (default)
sandagent run -- "Create a hello world script"

# Explicitly choose Claude
sandagent run --runner claude -- "Create a hello world script"

# Using Codex
sandagent run --runner codex -- "Build a REST API with Express"

# Using Gemini
sandagent run --runner gemini -- "Build a REST API with Express"

# Using GitHub Copilot (when implemented)
sandagent run --runner copilot -- "Refactor this code"

# With custom system prompt
sandagent run --runner claude --system-prompt "You are a coding assistant" -- "Build a REST API with Express"
```

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--runner <runner>` | `-r` | Runner to use: `claude`, `codex`, `gemini`, `copilot`, `pi` | `claude` |
| `--model <model>` | `-m` | Model to use | `claude-sonnet-4-20250514` |
| `--cwd <path>` | `-c` | Working directory | Current directory |
| `--system-prompt <prompt>` | `-s` | Custom system prompt | - |
| `--max-turns <n>` | `-t` | Maximum conversation turns | - |
| `--allowed-tools <tools>` | `-a` | Comma-separated list of allowed tools | - |
| `--resume <session-id>` | `-r` | Resume a previous session | - |
| `--output-format <format>` | `-o` | Output format: `stream` or `json` | `stream` |
| `--help` | `-h` | Show help message | - |

## Output Formats

### Stream Format (Default)

Outputs Server-Sent Events (SSE) using the AI SDK UI Stream Protocol. Ideal for real-time UI streaming.

```bash
sandagent run -- "Calculate 2+2"
```

**Output:**
```
data: {"type":"start","messageId":"msg_123"}
data: {"type":"text-delta","id":"text_1","delta":"The answer is 4."}
data: [DONE]
```

### JSON Format

Outputs a structured JSON object with complete message content and metadata. Ideal for API integration and automation.

```bash
sandagent run --output-format json -- "Calculate 2+2"
# or
sandagent run -o json -- "Calculate 2+2"
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude runner) | No |
| `OPENAI_API_KEY` or `CODEX_API_KEY` | OpenAI API key (Codex runner) | No |
| `GEMINI_API_KEY` | Gemini API key (Gemini runner) | No |
| `SANDAGENT_WORKSPACE` | Default workspace path | No |
| `SANDAGENT_LOG_LEVEL` | Logging level (debug, info, warn, error) | No |

## Advanced Examples

### Specify Working Directory

```bash
sandagent run --cwd ./my-project -- "Fix the bug in main.ts"
```

### JSON Output for Automation

```bash
# Save result to file
sandagent run -o json -- "Generate UUID" > result.json

# Parse with jq
sandagent run -o json -- "What is 2+2?" | jq '.content[0].text'
```

### Combined Options

```bash
sandagent run \
  -o json \
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
4. Support both SSE stream and JSON output formats

## 🐳 Docker Image Build

Build Docker images with agent templates baked in:

```bash
# Build image
sandagent image build --name vikadata/sandagent-seo --tag 0.1.0 --template ./templates/seo-agent

# Build and push
sandagent image build --name vikadata/sandagent-seo --tag 0.1.0 --template ./templates/seo-agent --push

# Without template
sandagent image build --name vikadata/sandagent --tag 0.1.0
```

### Image Build Options

| Option | Description | Default |
|--------|-------------|---------|
| `--name <name>` | Full image name (e.g. `vikadata/sandagent-seo`) | `sandagent` |
| `--tag <tag>` | Image tag | `latest` |
| `--image <full>` | Full image name override (e.g. `myorg/myimage:v1`) | - |
| `--platform <plat>` | Build platform | `linux/amd64` |
| `--template <path>` | Path to agent template directory | - |
| `--push` | Push image to registry after build | `false` |

## Related Documentation

- [Claude Agent SDK](https://platform.claude.com/docs/agent-sdk/typescript)
- [AI SDK UI Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
