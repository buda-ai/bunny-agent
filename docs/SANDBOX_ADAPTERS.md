# Sandbox Adapters Guide

**Choose where your agents run**

Bunny Agent runs agents through interchangeable sandbox adapters:
- **E2B** — Managed cloud sandboxes
- **Smol Machines** — Local microVMs or Smol Cloud, with the same adapter API
- **Sandock** — Cloud sandboxes
- **LocalMachine** — Trusted commands on the host
- **SrtSandbox** — OS-level local sandboxing

All provide the same interface, so you can switch with one import.

---

## Quick Comparison

| Feature | E2B | Smol Machines | Sandock | LocalMachine | SrtSandbox |
|---------|-----|---------------|---------|--------------|------------|
| Setup | API key | No key locally, cloud login remotely | API key | None | Linux: bwrap + socat |
| Hosting | Cloud | Local or cloud | Cloud | Local | Local |
| Isolation | Firecracker microVM | microVM | Container | **None** | OS-level (bubblewrap / Seatbelt) |
| Customization | Templates | OCI image, workdir, templates | Any Docker image | Workdir + templates | Workdir + templates + srt policy |

---

## E2B (Recommended for Production)

```ts
import { E2BSandbox } from "@bunny-agent/sandbox-e2b";

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

## Smol Machines (local VM or cloud)

Use one adapter to run coding agents in a local microVM, or on Smol Cloud by changing `target`:

```bash
pnpm add @bunny-agent/sandbox-smol
```

```ts
import { SmolSandbox } from "@bunny-agent/sandbox-smol";

const sandbox = new SmolSandbox({ name: "my-agent", target: "local" });
// For Smol Cloud: target: "cloud" (SMOL_CLOUD_TOKEN or `smol auth login`).
```

The default image is `node:22-slim`. On first attach the adapter installs
`@bunny-agent/runner-cli` in `/workspace`, then reuses it on later attaches.
A named VM stops on `destroy()` and retains its disk for the next session;
without a name it is deleted on destroy. Local execution requires `/dev/kvm`
on Linux or Hypervisor.framework on macOS. Cloud requires a Smol account and
uses the CLI login or `SMOL_CLOUD_TOKEN`; anonymous cloud machines have a
2-hour expiry as a safety net, and cloud VMs auto-stop after 30 idle minutes.
Both targets need network access to install
the runner the first time. Set `templatesPath` to upload local template files
into a newly created VM.

Monorepo CLI: `node apps/manager-cli/dist/cli.js run --sandbox smol "task"`
for local, or `--sandbox smol-cloud` for cloud. Pass `--id NAME` to choose
the reusable session name.

## Sandock (Docker-based)

**Best for**: Development, self-hosted deployments, custom Docker images.

```bash
pnpm add @bunny-agent/sandbox-sandock
```

```ts
import { SandockSandbox } from "@bunny-agent/sandbox-sandock";

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

## LocalMachine (host, NO isolation)

`@bunny-agent/sandbox-local` runs commands **directly on your machine with
your user's permissions** — it implements the `SandboxAdapter` interface but
provides no sandboxing at all. Use it only with trusted code (it was
previously named `LocalSandbox`; that alias still works but is deprecated).

```typescript
import { LocalMachine } from "@bunny-agent/sandbox-local";

const sandbox = new LocalMachine({
  workdir: "/tmp/my-agent",
  templatesPath: "./my-agent-template",
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workdir` | `string` | `process.cwd()` | Working directory |
| `templatesPath` | `string` | — | Template dir copied into workdir on attach |
| `runnerCommand` | `string[]` | `["bunny-agent", "run"]` | Runner invocation |
| `env` | `Record<string, string>` | `{}` | Extra env for every command |
| `defaultTimeout` | `number` | `300000` | Command timeout (ms) |

---

## SrtSandbox (local, OS-level isolation)

`@bunny-agent/sandbox-srt` is `LocalMachine` + real isolation: every command
is wrapped with [Anthropic's sandbox runtime](https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime)
(the sandbox used by Claude Code) — bubblewrap + network-namespace isolation
on Linux, Seatbelt on macOS, `srt-win` (alpha) on Windows. Policy is
allow-only: no network unless domains are allowlisted; writes only to the
workdir + OS temp dir (+ opted-in paths); reads open minus `denyRead`.

```typescript
import { SrtSandbox } from "@bunny-agent/sandbox-srt";

const sandbox = new SrtSandbox({
  workdir: "/tmp/my-agent",
  isolation: {
    allowedDomains: ["api.anthropic.com", "*.npmjs.org"],
    denyRead: ["~/.ssh", "~/.aws"],
    allowWrite: ["~/.npm"], // runners that write to the home dir need this
  },
});
```

### Configuration Options

All `LocalMachine` options, plus `isolation`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `isolation.allowedDomains` | `string[]` | `[]` (no network) | Reachable domains (`*.example.com` ok) |
| `isolation.deniedDomains` | `string[]` | `[]` | Always-blocked domains |
| `isolation.denyRead` | `string[]` | `[]` | Unreadable paths |
| `isolation.allowWrite` | `string[]` | `[]` | Extra writable paths |
| `isolation.denyWrite` | `string[]` | `[]` | Deny-writes inside allowed paths |
| `isolation.allowLocalBinding` | `boolean` | `false` | Allow binding local ports |
| `isolation.settingsPath` | `string` | generated | Bring-your-own srt settings file |
| `isolation.srtCommand` | `string[]` | resolved srt CLI | Override wrapper argv |

Linux requirements: `bubblewrap` and `socat` installed; on Ubuntu 24.04+ an
AppArmor profile granting bwrap `userns` (see
`docs/changelog/2026-07-16-local-machine-rename-srt-sandbox.md`).

---

## Switching Between Adapters

Switch sandbox providers with one line:

```typescript
import { E2BSandbox } from "@bunny-agent/sandbox-e2b";
import { SandockSandbox } from "@bunny-agent/sandbox-sandock";

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
  attach(): Promise<SandboxHandle>;
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
