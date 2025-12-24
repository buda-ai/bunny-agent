# Agent Templates

This directory contains pre-configured agent templates for SandAgent.
Each template provides a complete environment setup including Claude configuration,
MCP servers, skills, and system prompts.

## Available Templates

| Template | Description | Best For |
|----------|-------------|----------|
| `default` | General-purpose agent | Most tasks, starting point |
| `coder` | Software development focused | Coding, debugging, refactoring |
| `analyst` | Data analysis optimized | Data processing, SQL, visualization |
| `researcher` | Web research capabilities | Information gathering, summarization |

## Template Structure

Each template follows this structure:

```
template-name/
├── .claude/
│   ├── settings.json      # Claude-specific settings
│   └── mcp.json           # MCP server configuration
├── CLAUDE.md              # System instructions for the agent
├── skills/                # Pre-defined skill files (optional)
│   ├── skill1.md
│   └── skill2.md
└── workspace/             # Initial workspace files (optional)
    └── .gitkeep
```

## Using Templates

### With SandAgent Core

```typescript
import { SandAgent } from "@sandagent/core";
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const agent = new SandAgent({
  id: "my-session",
  sandbox: new E2BSandbox(),
  runner: {
    kind: "claude-agent-sdk",
    model: "claude-sonnet-4-20250514",
    template: "coder",  // Use the coder template
  },
});
```

### With CLI

```bash
sandagent run --template coder --model claude-sonnet-4-20250514 -- "Build a REST API"
```

## Creating Custom Templates

1. Copy an existing template directory:
   ```bash
   cp -r templates/default templates/my-custom
   ```

2. Modify the files to suit your needs:
   - Update `CLAUDE.md` with custom system instructions
   - Configure MCP servers in `.claude/mcp.json`
   - Add skills in the `skills/` directory

3. Use your custom template:
   ```typescript
   runner: {
     kind: "claude-agent-sdk",
     model: "claude-sonnet-4-20250514",
     template: "my-custom",
   }
   ```

## Template Components

### CLAUDE.md

The main system instructions file. This is read by Claude at startup and defines:
- Agent personality and behavior
- Available capabilities
- Constraints and limitations
- Task-specific guidance

### .claude/settings.json

Claude-specific settings:
```json
{
  "max_tokens": 8096,
  "temperature": 0.7,
  "allowed_tools": ["bash", "read_file", "write_file"],
  "timeout_ms": 300000
}
```

### .claude/mcp.json

MCP (Model Context Protocol) server configuration:
```json
{
  "servers": {
    "filesystem": {
      "command": "mcp-server-filesystem",
      "args": ["/workspace"]
    }
  }
}
```

### skills/

Skill files are markdown documents that provide Claude with specific knowledge
or capabilities. They are loaded as context when the agent starts.

## Default Template Details

The `default` template provides:
- General-purpose system prompt
- Basic file system tools (bash, read_file, write_file)
- No pre-configured MCP servers (can be added as needed)
- Balanced settings for various tasks

See individual template directories for specific configurations.
