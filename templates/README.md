# Agent Templates

**Templates are the heart of SandAgent** — they turn a general-purpose coding agent into a specialized Super Agent for your use case.

## Why Templates?

Instead of writing SDK code, tool definitions, and memory management, you just write markdown files that describe:
- Who your agent is
- What it specializes in
- How it should approach tasks

**That's it.** The underlying coding agent (Claude Code) handles everything else.

## Available Templates

| Template | Description | Best For |
|----------|-------------|----------|
| `default` | General-purpose agent | Most tasks, starting point |
| `coder` | Software development focused | Coding, debugging, refactoring |
| `analyst` | Data analysis optimized | Data processing, SQL, visualization |
| `researcher` | Web research capabilities | Information gathering, summarization |
| `gaia-agent` | GAIA Benchmark Super Agent | Complex multi-step reasoning, benchmarks |
| `seo-agent` | SEO optimization | Keyword research, content optimization |

## Template Structure

Each template follows this structure:

```
template-name/
├── CLAUDE.md              # System instructions for the agent (required)
├── .claude/
│   ├── settings.json      # Claude-specific settings (optional)
│   └── mcp.json           # MCP server configuration (optional)
├── skills/                # Pre-defined skill files (optional)
│   ├── skill1.md
│   └── skill2.md
└── workspace/             # Initial workspace files (optional)
    └── .gitkeep
```

### CLAUDE.md (Required)

The main system instructions file. This defines:
- Agent personality and behavior
- Domain expertise and capabilities
- Task-specific guidance and workflows

**This is the most important file** — it's what transforms a general coding agent into your specialized Super Agent.

### skills/ (Optional)

Skill files are markdown documents that provide domain-specific knowledge. They're loaded as context when the agent starts.

Examples:
- `sql-patterns.md` — Common SQL query patterns
- `api-design.md` — REST API best practices
- `data-viz.md` — Visualization guidelines

### .claude/settings.json (Optional)

Model configuration:
```json
{
  "max_tokens": 8096,
  "temperature": 0.7,
  "allowed_tools": ["bash", "read_file", "write_file"],
  "timeout_ms": 300000
}
```

### .claude/mcp.json (Optional)

MCP (Model Context Protocol) server configuration for additional capabilities:
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
    template: "analyst",  // Use the analyst template
  },
});
```

### With CLI

```bash
# Use a built-in template
sandagent run --template coder -- "Build a REST API"

# Use a custom template path
sandagent run --template ./my-custom-agent -- "Analyze this data"
```

## Creating Your Own Template

Creating a custom agent is as simple as creating a folder with markdown files:

```
my-agent/
├── CLAUDE.md              # System instructions (who is this agent?)
├── skills/                # Domain knowledge files (optional)
│   ├── skill1.md
│   └── skill2.md
└── .claude/
    └── settings.json      # Model configuration (optional)
```

### Example: Creating a "Customer Support" Agent

1. Create a new folder:
```bash
mkdir templates/support-agent
```

2. Create `CLAUDE.md`:
```markdown
# Customer Support Agent

You are an expert customer support agent for a SaaS product.

## Your Expertise
- Troubleshooting technical issues
- Explaining features clearly to non-technical users
- De-escalating frustrated customers
- Finding solutions in documentation

## Your Approach
1. Always acknowledge the customer's frustration first
2. Ask clarifying questions before jumping to solutions
3. Provide step-by-step instructions with screenshots when possible
4. Follow up to ensure the issue is resolved

## Tone
- Friendly and empathetic
- Professional but not robotic
- Patient with repeated questions
```

3. Use your template:
```typescript
runner: {
  kind: "claude-agent-sdk",
  model: "claude-sonnet-4-20250514",
  template: "support-agent",
}
```

**That's it!** No SDK code. No tool definitions. No memory management.

## Tips for Great Templates

1. **Be specific about expertise** — "You are an expert in PostgreSQL optimization" is better than "You know databases"

2. **Define workflows** — Tell the agent how to approach tasks step-by-step

3. **Set boundaries** — What should the agent NOT do?

4. **Include examples** — Show the agent what good output looks like

5. **Add domain knowledge** — Use skill files for reference material the agent should know

---

See individual template directories for specific configurations and examples.
