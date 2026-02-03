# Deployment and Templates

SandAgent supports two ways to run:

1. **Runtime templates**: upload templates at startup
2. **Prebuilt images**: bake templates into the sandbox image

This doc covers both and explains how to deploy to E2B or Daytona.

## Mode 1: Runtime Templates (No Prebuild)

Best for local dev and fast iteration.

### Pros

- No Docker build required
- Switch templates at runtime
- Works with LocalSandbox, E2B, or Daytona

### Example (E2B)

```typescript
import { createSandAgent } from "@sandagent/sdk";
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import path from "path";

const sandbox = new E2BSandbox({
  template: "base",
  templatesPath: path.join(__dirname, "../templates/researcher"),
  workdir: "/workspace",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});

const sandagent = createSandAgent({ sandbox });
```

### Example (Daytona)

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";
import path from "path";

const sandbox = new DaytonaSandbox({
  name: "my-agent",
  volumeName: "my-agent-volume",
  templatesPath: path.join(__dirname, "../templates/researcher"),
  workdir: "/workspace",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});
```

## Mode 2: Prebuilt Images (Templates Baked In)

Best for production when you want fast startup.

### Prerequisites

- Docker installed
- Provider API key
- Template(s) under `templates/`

### E2B Deployment

1. Configure env:

```bash
# docker/sandagent-claude/.env
E2B_API_KEY=e2b_xxx
# Optional
# IMAGE_TAG=0.1.0
```

2. Deploy:

```bash
cd docker/sandagent-claude

# Base image (no template)
make e2b

# With template
make e2b TEMPLATE=researcher

# Force overwrite
make e2b TEMPLATE=researcher FORCE=true
```

3. Use in code:

```typescript
const sandbox = new E2BSandbox({
  template: "sandagent-claude-researcher",
  workdir: "/workspace",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});
```

### Daytona Deployment

1. Configure env:

```bash
# docker/sandagent-claude/.env
DAYTONA_API_KEY=dtn_xxx
# Optional
# IMAGE_TAG=0.1.0
```

2. Deploy:

```bash
cd docker/sandagent-claude

# Base snapshot
make daytona

# With template
make daytona TEMPLATE=researcher

# Force overwrite
make daytona TEMPLATE=researcher FORCE=true
```

3. Use in code:

```typescript
const sandbox = new DaytonaSandbox({
  snapshot: "sandagent-claude-researcher:0.1.0",
  name: "my-agent",
  volumeName: "my-agent-volume",
  workdir: "/workspace",
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },
});
```

## Template Structure

```
templates/my-agent/
├── CLAUDE.md
└── .claude/
    ├── settings.json
    ├── mcp.json
    └── skills/
        └── my-skill/
            └── SKILL.md
```

- `CLAUDE.md` defines system instructions
- `.claude/skills/` holds skill definitions

## FAQs

### Do I have to prebuild?

No. Runtime templates are fully supported and simpler for development.

### Can I run without templates?

Yes. Omit `templatesPath` and use a base image.

### E2B vs Daytona?

- E2B: fast start, pause/resume
- Daytona: volume persistence

## Related Docs

- `docs/SERVER_SANDBOX_GUIDE.md`
- `docs/SANDBOX_REUSE.md`
- `templates/README.md`
- `docker/sandagent-claude/README.md`
