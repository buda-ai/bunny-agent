# @bunny-agent/manager-cli

Start Bunny Agent from your terminal using templates, run tasks in E2B, Sandock, or Smol Machines sandboxes, and manage sessions (list/stop).

> Note: this is a monorepo internal CLI (`"private": true`) and is not published to npm. Run it from the repo source.

## Quick start (beginner-friendly)

Prereqs: Node.js >= 20, `pnpm`, and a sandbox backend (`--sandbox smol` uses a local VM without a sandbox API key).

```bash
# 1) Install deps (from monorepo root)
pnpm install

# 2) Build the CLI
pnpm --filter @bunny-agent/manager-cli build

# 3) Run (execute the built artifact with node)
node apps/manager-cli/dist/cli.js info
node apps/manager-cli/dist/cli.js templates
```

Run a task (examples):

```bash
# Requires: ANTHROPIC_API_KEY (and your sandbox key, e.g. E2B_API_KEY)
node apps/manager-cli/dist/cli.js run "Create a hello world script"
node apps/manager-cli/dist/cli.js run --template coder "Build a REST API"
node apps/manager-cli/dist/cli.js run --sandbox smol --id my-vm "Run locally in a VM"
node apps/manager-cli/dist/cli.js run --sandbox smol-cloud --id my-vm "Run in Smol Cloud"
```

## Common commands

- `run [options] <prompt>`: run a task in a sandbox (`--template` / `--sandbox` / `--workspace`)
- `list`: list running sandboxes/sessions
- `stop <id>`: stop a sandbox/session
- `templates`: list available templates
- `info`: show environment and configuration

## Environment variables (most common)

- `ANTHROPIC_API_KEY`: required (Claude)
- `E2B_API_KEY`: required for E2B
- `SANDOCK_API_KEY` / `DOCKER_HOST`: for Sandock
- `DAYTONA_API_KEY`: for Daytona
- `SMOL_CLOUD_TOKEN`: for Smol Cloud, or use `smol auth login` (local Smol needs no token)
- `BUNNY_AGENT_TEMPLATE`: default template
- `BUNNY_AGENT_SANDBOX`: default sandbox (`e2b` / `sandock` / `smol` / `smol-cloud` / `local`)

## License

Apache 2.0
