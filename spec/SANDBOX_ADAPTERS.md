# Sandbox Adapters Guide

**Configuring and customizing sandbox environments**

---

## Overview

SandAgent uses **sandbox adapters** to provide isolated execution environments. Each adapter implements the `SandboxAdapter` interface:

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

## Available Adapters

### 1. Sandock (Cloud Docker Service)

**Best for**: Production deployments with Docker, managed cloud sandboxes.

Sandock is a cloud-based Docker sandbox service. Uses the official [Sandock SDK](https://www.npmjs.com/package/sandock).

```bash
pnpm add @sandagent/sandbox-sandock
```

```ts
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  // Sandock API key (required)
  apiKey: process.env.SANDOCK_API_KEY,
  
  // API base URL (optional, defaults to https://sandock.ai)
  baseUrl: "https://sandock.ai",
  
  // Docker image to use
  image: "sandockai/sandock-code:latest",
  
  // Working directory
  workdir: "/workspace",
  
  // Memory limit in MB
  memoryLimitMb: 1024,
  
  // CPU shares
  cpuShares: 512,
  
  // Keep sandbox running after execution
  keep: true,
});
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `env.SANDOCK_API_KEY` | Sandock API key |
| `baseUrl` | `string` | `"https://sandock.ai"` | Sandock API URL |
| `image` | `string` | `"sandockai/sandock-code:latest"` | Docker image |
| `workdir` | `string` | `"/workspace"` | Working directory |
| `memoryLimitMb` | `number` | - | Memory limit in MB |
| `cpuShares` | `number` | - | CPU shares |
| `keep` | `boolean` | `true` | Keep sandbox after execution |

#### API Endpoints Used

| Endpoint | Description |
|----------|-------------|
| `POST /api/sandbox` | Create a new sandbox |
| `POST /api/sandbox/{id}/start` | Start the sandbox |
| `POST /api/sandbox/{id}/shell` | Execute shell commands |
| `POST /api/sandbox/{id}/fs/write` | Write files |
| `POST /api/sandbox/{id}/stop` | Stop the sandbox |
| `DELETE /api/sandbox/{id}` | Delete the sandbox |

#### Requirements

- Sandock API key (get one at [sandock.ai](https://sandock.ai))
- Internet access from your server

---

### 2. E2B (Cloud-based)

**Best for**: Production deployments, scalability, managed infrastructure.

```bash
pnpm add @sandagent/sandbox-e2b
```

```ts
import { E2BSandbox } from "@sandagent/sandbox-e2b";

const sandbox = new E2BSandbox({
  // E2B API key
  apiKey: process.env.E2B_API_KEY,
  
  // Sandbox template
  template: "base",
  
  // Execution timeout (ms)
  timeout: 60000,
});
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `env.E2B_API_KEY` | E2B API key |
| `template` | `string` | `"base"` | Sandbox template |
| `timeout` | `number` | `60000` | Execution timeout (ms) |

#### Templates

E2B provides various pre-configured templates:

| Template | Description |
|----------|-------------|
| `base` | Basic Linux environment |
| `python` | Python with common packages |
| `nodejs` | Node.js environment |
| `code-interpreter` | Full code interpreter |

#### Requirements

- E2B API key (get one at [e2b.dev](https://e2b.dev))
- Internet access from your server

---

## Creating Custom Adapters

You can create custom sandbox adapters by implementing the `SandboxAdapter` interface:

```ts
import type { SandboxAdapter, SandboxHandle, ExecOptions } from "@sandagent/core";

export class MyCustomSandbox implements SandboxAdapter {
  async attach(id: string): Promise<SandboxHandle> {
    // Create or attach to a sandbox instance
    const instance = await this.createOrGetInstance(id);
    
    return {
      exec: (command, opts) => this.executeCommand(instance, command, opts),
      upload: (files, targetDir) => this.uploadFiles(instance, files, targetDir),
      destroy: () => this.destroyInstance(instance),
    };
  }
  
  private async createOrGetInstance(id: string) {
    // Your implementation
  }
  
  private async *executeCommand(
    instance: MyInstance,
    command: string[],
    opts?: ExecOptions
  ): AsyncIterable<Uint8Array> {
    // Stream stdout as Uint8Array chunks
    for await (const chunk of instance.runCommand(command)) {
      yield new TextEncoder().encode(chunk);
    }
  }
  
  private async uploadFiles(
    instance: MyInstance,
    files: Array<{ path: string; content: Uint8Array | string }>,
    targetDir: string
  ): Promise<void> {
    for (const file of files) {
      await instance.writeFile(`${targetDir}/${file.path}`, file.content);
    }
  }
  
  private async destroyInstance(instance: MyInstance): Promise<void> {
    await instance.terminate();
  }
}
```

### Key Requirements

1. **`exec()` must return an AsyncIterable<Uint8Array>**
   - Stream stdout incrementally
   - Each chunk should be valid UTF-8 for AI SDK UI messages

2. **Persistence by ID**
   - Same `id` should return the same filesystem state
   - Volumes/state should persist between `attach()` calls

3. **Isolation**
   - Different IDs should be completely isolated
   - No cross-contamination of filesystems

---

## Comparison

| Feature | Sandock | E2B |
|---------|---------|-----|
| Setup | API key | API key |
| Hosting | Cloud (sandock.ai) | Cloud (e2b.dev) |
| Cost | Pay per use | Pay per use |
| Latency | Medium (network) | Medium (network) |
| Scalability | Highly scalable | Highly scalable |
| Persistence | Managed by Sandock | Managed by E2B |
| Customization | Any Docker image | Limited to templates |
| SDK | `sandock` | `e2b` |

---

## Best Practices

### 1. Match Adapter to Environment

```ts
// Development
const sandbox = new SandockSandbox();

// Production
const sandbox = process.env.NODE_ENV === "production"
  ? new E2BSandbox({ apiKey: process.env.E2B_API_KEY })
  : new SandockSandbox();
```

### 2. Set Appropriate Timeouts

```ts
// Short tasks
const sandbox = new E2BSandbox({ timeout: 30000 });

// Long-running tasks
const sandbox = new E2BSandbox({ timeout: 300000 });
```

### 3. Resource Limits for Sandock

```ts
const sandbox = new SandockSandbox({
  memoryLimit: "2g",  // Prevent memory exhaustion
  cpuLimit: 2,        // Fair resource sharing
});
```

### 4. Volume Cleanup

Implement cleanup for unused volumes:

```bash
# Find volumes older than 7 days
find /var/sandagent/volumes -type d -mtime +7 -exec rm -rf {} \;
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
