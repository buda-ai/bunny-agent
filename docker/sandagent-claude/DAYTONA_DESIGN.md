# Daytona Snapshot Design

## Overview

This document explains the design principles of the `sandagent-claude` Docker image on the Daytona platform, specifically how volume mounts and dependency management are handled.

## Core Problem: Volume Mount Override

Daytona sandbox uses a **Volume** to persist the `/workspace` directory:

```
On sandbox creation:
├── /workspace/           ← Volume mount point (empty directory)
│   └── (user files persisted here)
└── /opt/sandagent/       ← Image contents (not affected by Volume)
```

**Key point**: Volume mounts **completely override** the `/workspace` directory, which means:
- Dependencies pre-installed at `/workspace/node_modules` in the image will "disappear"
- Template files pre-installed at `/workspace/` in the image will also "disappear"

## Solution

### 1. Dependency Installation Location

Install dependencies to `/opt/sandagent/node_modules` (not overridden by Volume):

```dockerfile
# Install dependencies to /opt/sandagent (Volume-safe)
RUN mkdir -p /opt/sandagent && \
    cd /opt/sandagent && \
    npm install @anthropic-ai/claude-agent-sdk @sandagent/runner-cli@latest

# Set NODE_PATH so Node.js can find the dependencies
ENV NODE_PATH=/opt/sandagent/node_modules
```

### 2. Template File Location

Copy template files to `/opt/sandagent/templates`:

```dockerfile
# Copy template files to /opt/sandagent/templates (Volume-safe)
COPY templates/researcher/CLAUDE.md /opt/sandagent/templates/CLAUDE.md
COPY templates/researcher/.claude /opt/sandagent/templates/.claude
```

### 3. sandagent Command

Create a system-level command at `/usr/local/bin/sandagent`:

```dockerfile
RUN echo '#!/usr/bin/env node' > /usr/local/bin/sandagent && \
    echo 'import("/opt/sandagent/node_modules/@sandagent/runner-cli/dist/bundle.mjs")' >> /usr/local/bin/sandagent && \
    chmod +x /usr/local/bin/sandagent
```

### 4. Runtime Initialization

When using a snapshot, the code automatically copies template files from `/opt/sandagent/templates` to `/workspace`:

```typescript
// packages/sandbox-daytona/src/daytona-sandbox.ts
if (this.snapshot) {
  // Copy templates from /opt/sandagent/templates to /workspace
  await handle.runCommand(
    `cp -r /opt/sandagent/templates/* ${this.workdir}/`
  );
}
```

## Directory Structure

### Snapshot Image Contents

```
/
├── opt/
│   └── sandagent/
│       ├── node_modules/           # Pre-installed dependencies
│       │   ├── @anthropic-ai/
│       │   │   └── claude-agent-sdk/
│       │   └── @sandagent/
│       │       └── runner-cli/
│       └── templates/              # Template files (optional)
│           ├── CLAUDE.md
│           └── .claude/
├── usr/
│   └── local/
│       └── bin/
│           └── sandagent           # System command
└── workspace/                      # Working directory (Volume mount)
```

### Runtime (after Volume mount)

```
/
├── opt/sandagent/                  # From image (unchanged)
│   ├── node_modules/
│   └── templates/
├── usr/local/bin/sandagent         # From image (unchanged)
└── workspace/                      # From Volume (persisted)
    ├── CLAUDE.md                   # Copied from /opt/sandagent/templates
    ├── .claude/                    # Copied from /opt/sandagent/templates
    └── (user-created files...)
```

## Build Process

### Base Image (no template)

```bash
make build
make daytona
# → sandagent-claude:0.1.2
```

### Image with Template

```bash
make daytona TEMPLATE=researcher
# → sandagent-claude-researcher:0.1.2
```

### Build Steps

1. `generate-dockerfile.sh` generates a Dockerfile with template COPY instructions
2. Docker builds the image, installing dependencies and templates to `/opt/sandagent`
3. `daytona snapshot push` pushes the image to Daytona

## Usage

### In Code

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  snapshot: "sandagent-claude-researcher:0.1.2",
  volumeName: "my-sandbox",
  volumeMountPath: "/workspace",
  workdir: "/workspace",
});
```

### Execution Flow

1. Daytona creates the sandbox, mounting the Volume to `/workspace`
2. Code detects that a snapshot is being used
3. Templates are copied from `/opt/sandagent/templates` to `/workspace`
4. The `sandagent run` command is executed

## Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_PATH` | `/opt/sandagent/node_modules` | Node.js module search path |
| `PATH` | `/usr/local/bin:$PATH` | Includes the sandagent command |

## FAQ

### Q: Why not install dependencies to /workspace?

A: Because `/workspace` is the Volume mount point — the Volume mount overrides image contents at that path.

### Q: Are template files copied every time?

A: Yes, they are copied from `/opt/sandagent/templates` to `/workspace` on each new sandbox creation or restart.

### Q: Will user-modified files be lost?

A: No. Files created or modified by the user in `/workspace` are stored in the Volume and persisted.

### Q: How do I update dependency versions?

A: Update the version numbers in the Dockerfile and rebuild the image and snapshot:
```bash
make daytona TEMPLATE=researcher IMAGE_TAG=0.2.0 FORCE=true
```

## Related Files

- `Dockerfile` - Base Dockerfile
- `Dockerfile.template` - Template with placeholders
- `generate-dockerfile.sh` - Generates Dockerfile with template
- `Makefile` - Build and deployment commands
- `build-daytona-snapshot.ts` - Daytona snapshot build script
