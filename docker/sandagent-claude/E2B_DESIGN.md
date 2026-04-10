# E2B Template Design

## Overview

This document explains the design principles of the `sandagent-claude` Docker image on the E2B platform.

E2B **has no Volume concept**, but uses the same directory structure design as Daytona for consistency.

## Directory Structure

```
/
├── opt/sandagent/
│   ├── node_modules/           # Pre-installed dependencies
│   └── templates/              # Template files
├── usr/local/bin/sandagent     # System command
└── workspace/                  # Working directory
```

### Why not install directly to /workspace?

Although E2B has no Volume override issue, using the same design provides:
1. **Consistency**: Daytona and E2B use the same Dockerfile
2. **Maintainability**: One codebase handles both platforms
3. **Flexibility**: No changes needed if E2B adds persistence features in the future

## Build Process

### Base Template (no custom template)

```bash
make e2b
# → sandagent-claude
```

### Image with Template

```bash
make e2b TEMPLATE=researcher
# → sandagent-claude-researcher
```

## Usage

### In Code

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  template: "sandagent-claude-researcher",  // templates starting with "sandagent" use pre-installed deps
  workdir: "/workspace",
});
```

### Execution Flow

1. E2B creates the sandbox
2. Code detects that the template name starts with `sandagent`
3. Templates are copied from `/opt/sandagent/templates` to `/workspace`
4. The `sandagent run` command is executed

## Auto-Detection Mechanism

The E2B sandbox automatically determines whether to use a custom template via the `template` parameter:

- `template` starts with `sandagent` → Use pre-installed deps, copy templates from `/opt/sandagent/templates`
- Other templates (e.g. `base`) → Install dependencies at runtime

## FAQ

### Q: How does E2B determine whether to use a custom template?

A: Via the `template` parameter — templates starting with `sandagent` automatically skip dependency installation and use the pre-installed deps in `/opt/sandagent`.

### Q: Does the E2B template need to be redeployed after an update?

A: Yes, you need to re-run `make e2b TEMPLATE=xxx` to update the template.

### Q: Can a local templatesPath override the template?

A: Yes. If both `template` and `templatesPath` are set, the local template is uploaded and overrides the one in the image.

## Related Files

- `Dockerfile` - Base Dockerfile
- `Dockerfile.template` - Template with placeholders
- `generate-dockerfile.sh` - Generates Dockerfile with template
- `Makefile` - Build and deployment commands
- `build-e2b-template.ts` - E2B template build script
