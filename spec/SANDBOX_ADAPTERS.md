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

### 1. Sandock (Docker-based)

**Best for**: Local development, self-hosted deployments, full control over environment.

```bash
pnpm add @sandagent/sandbox-sandock
```

```ts
import { SandockSandbox } from "@sandagent/sandbox-sandock";

const sandbox = new SandockSandbox({
  // Docker image to use
  image: "node:20-slim",
  
  // Where to store persistent volumes
  volumePrefix: "/var/sandagent/volumes",
  
  // Enable network access in sandbox
  networkEnabled: true,
  
  // Memory limit (e.g., "512m", "2g")
  memoryLimit: "1g",
  
  // CPU limit (number of cores)
  cpuLimit: 2,
  
  // Container startup timeout (ms)
  timeout: 30000,
});
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `image` | `string` | `"node:20-slim"` | Docker image to use |
| `volumePrefix` | `string` | `"/tmp/sandagent"` | Host path for volumes |
| `networkEnabled` | `boolean` | `true` | Allow network access |
| `memoryLimit` | `string` | `"1g"` | Container memory limit |
| `cpuLimit` | `number` | `2` | CPU core limit |
| `timeout` | `number` | `30000` | Startup timeout (ms) |

#### Volume Storage

Volumes are stored at `{volumePrefix}/{agentId}` on the host:

```
/var/sandagent/volumes/
├── user-123-project-a/
│   └── workspace/
├── user-456-project-b/
│   └── workspace/
```

#### Requirements

- Docker installed and running
- Sufficient disk space for volumes
- Docker daemon accessible (socket or TCP)

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
| Setup | Docker required | API key only |
| Cost | Free (self-hosted) | Pay per use |
| Latency | Low (local) | Medium (network) |
| Scalability | Limited by host | Highly scalable |
| Persistence | File-based volumes | Managed by E2B |
| Customization | Full (any Docker image) | Limited to templates |

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

### Sandock: Docker Permission Denied

```
Error: permission denied while trying to connect to Docker daemon
```

**Solution**: Add your user to the docker group or run with sudo.

### Sandock: Image Pull Failed

```
Error: pull access denied for custom-image
```

**Solution**: Login to your container registry or use a public image.

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
