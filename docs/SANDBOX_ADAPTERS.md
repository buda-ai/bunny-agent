# Sandbox Adapters Guide

**Choose where your agents run**

SandAgent runs agents in isolated sandbox environments. You can choose between:
- **E2B** — Cloud-hosted sandboxes (recommended for production)
- **Sandock** — Docker-based sandboxes (great for development)

Both provide the same interface, so you can switch with one line of code.

---

## Quick Comparison

| Feature | E2B | Sandock |
|---------|-----|---------|
| Setup | API key only | API key only |
| Best for | Production | Development |
| Hosting | Cloud (e2b.dev) | Cloud (sandock.ai) |
| Customization | Templates | Any Docker image |

---

## E2B (Recommended for Production)

```ts
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  apiKey: process.env.E2B_API_KEY,
  template: "base",
  timeout: 60000,
});
```

Get your API key at [e2b.dev](https://e2b.dev).

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `env.E2B_API_KEY` | E2B API key |
| `template` | `string` | `"base"` | Sandbox template |
| `timeout` | `number` | `60000` | Execution timeout (ms) |

### Available Templates

| Template | Description |
|----------|-------------|
| `base` | Basic Linux environment |
| `python` | Python with common packages |
| `nodejs` | Node.js environment |
| `code-interpreter` | Full code interpreter |

---

## Sandock (Docker-based)

**Best for**: Development, self-hosted deployments, custom Docker images.

```bash
pnpm add @sandagent/sandbox-sandock
```

```ts
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  apiKey: process.env.SANDOCK_API_KEY,
  image: "sandockai/sandock-code:latest",
  workdir: "/workspace",
  memoryLimitMb: 1024,
});
```

Get your API key at [sandock.ai](https://sandock.ai).

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `env.SANDOCK_API_KEY` | Sandock API key |
| `baseUrl` | `string` | `"https://sandock.ai"` | Sandock API URL |
| `image` | `string` | `"sandockai/sandock-code:latest"` | Docker image |
| `workdir` | `string` | `"/workspace"` | Working directory |
| `memoryLimitMb` | `number` | - | Memory limit in MB |
| `cpuShares` | `number` | - | CPU shares |
| `keep` | `boolean` | `true` | Keep sandbox after execution |

---

## Switching Between Adapters

Switch sandbox providers with one line:

```typescript
import { E2BSandbox } from "@sandagent/sandbox-e2b";
import { SandockSandbox } from "@sandagent/sandbox-sandock";

// Production: Use E2B
const prodSandbox = new E2BSandbox();

// Development: Use Sandock
const devSandbox = new SandockSandbox();

// Environment-based switching
const sandbox = process.env.NODE_ENV === "production"
  ? new E2BSandbox()
  : new SandockSandbox();
```

---

## Creating Custom Adapters

You can create custom sandbox adapters by implementing the `SandboxAdapter` interface:

```ts
interface SandboxAdapter {
  attach(id: string): Promise<SandboxHandle>;
}

interface SandboxHandle {
  exec(command: string[], opts?: ExecOptions): AsyncIterable<Uint8Array>;
  upload(files: Array<{ path: string; content: Uint8Array | string }>, targetDir: string): Promise<void>;
  destroy(): Promise<void>;
}
```

---

## Troubleshooting

### Sandock: API Key Invalid

```
Error: SANDOCK_API_KEY not set
```

**Solution**: Get an API key at [sandock.ai](https://sandock.ai) and set it.

### Sandock: Sandbox Creation Failed

```
Error: Failed to create sandbox
```

**Solution**: Check your API key and network connectivity.

### E2B: API Key Invalid

```
Error: Invalid API key
```

**Solution**: Check your E2B API key at [e2b.dev/dashboard](https://e2b.dev/dashboard).

### E2B: Sandbox Timeout

```
Error: Sandbox execution timed out
```

**Solution**: Increase the timeout or optimize the task.

---

## See Also

- [Technical Specification](./TECHNICAL_SPEC.md)
- [Persistence Guide](./PERSISTENCE_GUIDE.md)
- [Quick Start](./QUICK_START.md)
