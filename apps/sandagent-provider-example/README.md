# SandAgent Provider Example

This example demonstrates how to use the published `@sandagent` packages from npm.

## Setup

1. Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
pnpm install
```

## Usage

### Test with E2B

```bash
pnpm test:e2b
```

### Test with Daytona

```bash
pnpm test:daytona
```

## Packages Used

- `@sandagent/manager` - Core manager
- `@sandagent/sandbox-e2b` - E2B sandbox adapter
- `@sandagent/sandbox-daytona` - Daytona sandbox adapter
- `@sandagent/ai-provider` - Vercel AI SDK integration
