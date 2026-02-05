# @sandagent/manager-cli

Start SandAgent from your terminal using templates, run tasks in E2B/Sandock/Daytona sandboxes, and manage sessions (list/stop).

> Note: this is a monorepo internal CLI (`"private": true`) and is not published to npm. Run it from the repo source.

## Quick start (beginner-friendly)

Prereqs: Node.js >= 20, `pnpm`, and at least one sandbox API key (e.g. `E2B_API_KEY`).

```bash
# 1) Install deps (from monorepo root)
pnpm install

# 2) Build the CLI
pnpm --filter @sandagent/manager-cli build

# 3) Run (execute the built artifact with node)
node apps/manager-cli/dist/cli.js info
node apps/manager-cli/dist/cli.js templates
```

Run a task (examples):

```bash
# Requires: ANTHROPIC_API_KEY (and your sandbox key, e.g. E2B_API_KEY)
node apps/manager-cli/dist/cli.js run "Create a hello world script"
node apps/manager-cli/dist/cli.js run --template coder "Build a REST API"
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
- `SANDAGENT_TEMPLATE`: default template
- `SANDAGENT_SANDBOX`: default sandbox (`e2b` / `sandock` / `daytona`)

## License

Apache 2.0
