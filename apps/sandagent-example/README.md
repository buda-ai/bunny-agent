# SandAgent Example

A complete SandAgent example showing how to run AI Agents in E2B sandboxes with Next.js.

## Quick Start

### 1. Install dependencies

```bash
# From monorepo root
pnpm install
```

### 2. Build runner-cli

```bash
# For local development (creates bundle.mjs for uploading to sandbox)
pnpm --filter @sandagent/runner-cli build:bundle
# Run directly with node
node apps/runner-cli/dist/cli.js run --template coder


# For npm publish (only compiles TypeScript)
pnpm --filter @sandagent/runner-cli build

## Or
# Build CLI
pnpm --filter @sandagent/runner-cli build

# Global link (optional, allows using sandagent command directly)
cd apps/runner-cli && pnpm link --global && cd ../..

# Run built-in template
sandagent run --template coder
```

### 3. Configure API keys

In the browser Settings panel, configure:
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `E2B_API_KEY` - Your E2B API key (get one at https://e2b.dev)

### 4. Start dev server

```bash
cd apps/sandagent-example
pnpm dev
```

This starts:
- Next.js dev server
- `@sandagent/core` TypeScript watch
- `@sandagent/sandbox-e2b` TypeScript watch

## Architecture

```
Browser → Next.js API → SandAgent → E2B Sandbox → runner-cli → Claude Agent SDK
```

### Why is e2b installed in example?

`@sandagent/sandbox-e2b` declares `e2b` as an optional `peerDependency`:

1. **Flexibility** - Users can choose E2B or other sandboxes (e.g., sandock)
2. **Version control** - Apps control the exact e2b SDK version
3. **On-demand** - Projects not using E2B don't need to install it

We install `e2b` in example because we're using E2B as our sandbox provider.

## How it works

1. User sends a message from the frontend
2. `route.ts` receives the request, creates `E2BSandbox` and `SandAgent`
3. `E2BSandbox.attach()` creates an E2B sandbox and uploads:
   - `runner-cli/dist/bundle.mjs` → `/sandagent/runner/`
   - `templates/` → `/sandagent/templates/`
4. Installs `@anthropic-ai/claude-agent-sdk` in the sandbox
5. Executes `node /sandagent/runner/bundle.mjs run ...`
6. Runner calls Claude Agent SDK, streams AI SDK UI format output
7. Output is passed through directly to the browser

## Directory structure

```
apps/sandagent-example/
├── app/
│   ├── api/ai/route.ts    # API endpoint
│   ├── page.tsx           # Main page
│   └── layout.tsx
├── package.json
└── README.md
```

## Debugging

Check server logs for:
- `[API]` - API request info
- `[E2B]` - E2B sandbox operations
- `[E2B stderr]` - stderr output from inside the sandbox


## Production Deployment

Currently this example uploads the runner bundle and templates on every sandbox creation. For production, consider these approaches:

### Option 1: Custom E2B Template (Recommended)

Create a custom E2B template with runner-cli pre-installed:

1. Create an E2B template with Node.js
2. Pre-install `@sandagent/runner-cli` globally: `npm install -g @sandagent/runner-cli`
3. Pre-install `@anthropic-ai/claude-agent-sdk`
4. Include templates in `/sandagent/templates/`
5. Use this template ID in `E2BSandbox` options

Benefits:
- Fastest cold start (no upload/install on each request)
- Consistent environment
- Version-controlled sandbox configuration

### Option 2: Publish to npm

Publish `@sandagent/runner-cli` to npm, then install it dynamically:

```typescript
// In sandbox initialization
await sandbox.exec(['npm', 'install', '-g', '@sandagent/runner-cli']);
```

Benefits:
- No custom template needed
- Easy version updates

Drawbacks:
- Slower cold start (npm install on first request)

### Option 3: Pre-built Docker Image (for Sandock)

If using Sandock instead of E2B:

1. Create a Docker image with runner-cli pre-installed
2. Push to your container registry
3. Configure Sandock to use this image

### Roadmap

- [ ] Publish `@sandagent/runner-cli` to npm
- [ ] Create official E2B template with runner pre-installed
- [ ] Add template caching to avoid re-uploading on warm sandboxes
- [ ] Support for custom runner configurations
- [ ] Multi-model support (OpenAI, Gemini, etc.)
