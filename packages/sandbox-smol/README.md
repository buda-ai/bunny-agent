# @bunny-agent/sandbox-smol

Run a Bunny Agent inside a local Smol Machines microVM or on Smol Cloud.

```ts
import { SmolSandbox } from "@bunny-agent/sandbox-smol";

const sandbox = new SmolSandbox({ name: "project-1" });
// Choose Smol Cloud with: new SmolSandbox({ target: "cloud", name: "project-1" })
```

A local VM needs Linux KVM or macOS Hypervisor.framework; Smol Cloud needs
`SMOL_CLOUD_TOKEN` or `smol auth login`. The adapter starts from `node:22-slim`
and installs `@bunny-agent/runner-cli` in `/workspace` on first attach. Set
`image`, `workdir`, `templatesPath`, `cpus`, `memoryMb`, `env`, `apiKey`,
`autoStopSeconds`, or `ttlSeconds` in
`SmolSandboxOptions` as needed. The image must provide Node and npm.

Named sandboxes stop on `destroy()` and keep their disk for a later attach;
unnamed sandboxes are deleted. Cloud VMs auto-stop after 30 idle minutes,
and unnamed cloud VMs expire after two hours. To remove a named machine and
its disk, delete it using `Machine.connect(id, { target: "cloud" }).delete()` from
`smolmachines` on cloud (or `smol cloud rm`), or `Machine.connect(id).delete()`
locally. Machine IDs are available from
`handle.getSandboxId()` after attach.
