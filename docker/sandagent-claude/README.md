# SandAgent Claude Image

Pre-built Docker image with **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) and `@sandagent/runner-cli` pre-installed.

## Quick Start (Makefile)

One-command deployment to Daytona or E2B:

```bash
# Show all available commands
make help

# Build Docker image
make build

# Deploy to Daytona
make daytona

# Deploy to E2B
make e2b

# Deploy with custom resources
make daytona CPU=4 MEMORY=8 DISK=16

# Deploy to E2B with custom alias
make e2b E2B_ALIAS=my-custom-template

# Build with template included in image
make build TEMPLATE=coder

# Deploy with template (builds image with template files included, then deploys)
make daytona TEMPLATE=researcher
```

**Prerequisites:**
- For Daytona: `daytona` CLI installed and authenticated
- For E2B: `E2B_API_KEY` environment variable set

**Setup:**
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and add your API keys:
   ```bash
   DAYTONA_API_KEY=your_daytona_api_key
   E2B_API_KEY=e2b_your_api_key
   ```
3. The Makefile will automatically load `.env` file

## Pre-installed Packages

- `@anthropic-ai/claude-agent-sdk` - Anthropic Claude Agent SDK
- `@sandagent/runner-cli@beta` - SandAgent Runner CLI

## Manual Build

**Note**: The `Dockerfile` is the default version (without template). If you want to include a template, use `make build TEMPLATE=name` instead.

```bash
# Build for AMD64 (required for Daytona)
docker build --platform=linux/amd64 -t sandagent-claude:0.1.0 .

# Or use the Makefile (recommended)
make build
```

**File Structure:**
- `Dockerfile` - Default Dockerfile (no template, can be used directly)
- `Dockerfile.template` - Template file with `{{TEMPLATE_FILES}}` placeholder
- `generate-dockerfile.sh` - Script that generates Dockerfile from template

## Usage with Daytona Snapshot

### Using Makefile (Recommended)

```bash
# Deploy to Daytona (builds image and pushes)
make daytona

# Or use Dockerfile directly (no local build needed)
make daytona-dockerfile

# With custom resources
make daytona CPU=4 MEMORY=8 DISK=16
```

### Manual Deployment

**Option 1: Push local image**

```bash
# Build the image
docker build --platform=linux/amd64 -t sandagent-claude:0.1.0 .

# Push to Daytona
daytona snapshot push sandagent-claude:0.1.0 --name sandagent-claude --cpu 2 --memory 4 --disk 8
```

**Option 2: Use Dockerfile directly**

```bash
daytona snapshot create sandagent-claude --dockerfile ./Dockerfile --cpu 2 --memory 4 --disk 8
```

### Use in SDK

```typescript
import { DaytonaSandbox } from "@sandagent/sandbox-daytona";

const sandbox = new DaytonaSandbox({
  snapshot: "sandagent-claude",  // Use pre-built snapshot
  // ...
});
```

## Usage with E2B

E2B templates must be created programmatically using the SDK (not via Dashboard). E2B supports parsing Dockerfiles directly.

### Using Makefile (Recommended)

```bash
# Set E2B_API_KEY
export E2B_API_KEY=e2b_***

# Deploy to E2B
make e2b

# With custom alias and resources
make e2b E2B_ALIAS=my-template CPU=4 MEMORY=8
```

### Manual Deployment

Use the provided build script:

```bash
# Install dependencies (if not already installed)
npm install @e2b/sdk dotenv tsx

# Set E2B_API_KEY in .env file or environment
export E2B_API_KEY=e2b_***

# Run the build script
npx tsx build-e2b-template.ts

# With custom options
npx tsx build-e2b-template.ts --alias my-template --cpu 4 --memory 4096
```

The script will:
1. Read the Dockerfile
2. Create an E2B template from it
3. Build the template with the specified alias
4. Print the template ID for use in SandAgent

**Note**: Requires E2B SDK v2.3.0+. See [E2B Template Quickstart](https://e2b.dev/docs/template/quickstart) for more details.

### Use in SandAgent

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  template: "sandagent-claude",      // Your E2B template alias/ID
  skipDependencyInstall: true,       // Skip npm install (dependencies pre-installed)
  // ...
});
```

**Note**: The `CMD ["sleep", "infinity"]` in the Dockerfile will be converted to a start command by E2B, which is fine for keeping the container running.

## Environment Variables

The image sets these environment variables:

- `NODE_PATH=/workspace/node_modules:/usr/local/lib/node_modules`
- `PATH=/workspace/node_modules/.bin:/usr/local/bin:$PATH`

## Template Files

### Including Templates in Image

You can include template files (`.claude/` and `CLAUDE.md`) directly in the Docker image by specifying the `TEMPLATE` parameter:

```bash
# Build with a specific template
make build TEMPLATE=coder

# Deploy to Daytona with template (builds image with template, then deploys)
make daytona TEMPLATE=researcher

# Deploy to E2B with template
make e2b TEMPLATE=analyst

# Available templates: default, coder, researcher, analyst, etc.
```

**What happens:**
1. `generate-dockerfile.sh` reads `Dockerfile.template`
2. Adds `COPY` commands for the template's `.claude/` and `CLAUDE.md` files
3. Generates final `Dockerfile` with template files included
4. Builds Docker image (template files are baked into the image)
5. Deploys to Daytona/E2B

**Result:** When the sandbox starts, template files are already present in `/workspace/.claude/` and `/workspace/CLAUDE.md`, so no runtime upload is needed (unless you want to update them).

### Runtime Template Upload

When using SandAgent, template files are uploaded at runtime (every `attach()` call). **Only template files are overwritten**:

- ✅ **Overwritten**: `.claude/` directory and `CLAUDE.md` file
- ❌ **Not affected**: Other files in the workspace (user files, project files, etc.)

This ensures that:
1. Template files are always up-to-date
2. User's work in the sandbox is never lost
3. Only template configuration is updated

### Template File Structure

Templates are located in `templates/` directory:
```
templates/
  default/
    CLAUDE.md
    .claude/
      settings.json
      mcp.json
  coder/
    CLAUDE.md
    .claude/
      ...
```

Only `.claude/` and `CLAUDE.md` are collected and uploaded.

## Other Agent SDKs

For other agent SDKs (OpenAI, Google, etc.), create similar Dockerfiles:

- `docker/sandagent-openai/` - OpenAI Agent SDK
- `docker/sandagent-google/` - Google Agent SDK
- etc.
