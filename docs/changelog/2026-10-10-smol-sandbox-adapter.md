# Smol Machines sandbox adapter

- Added `@bunny-agent/sandbox-smol` with the same execution and file interface for local Smol microVMs and Smol Cloud.
- Wired `smol` and `smol-cloud` into the monorepo manager CLI, with disk-preserving named sessions and automatic runner installation.
- Added the adapter to the fixed release group and tag publishing workflow.
- Validated local and cloud create, file transfer, stop and reconnect; confirmed the installed runner starts on cloud and a local manager-level agent run streams output.
- Added focused adapter tests and documented local and cloud setup.
- Forward only supported Claude token and proxy environment variables from the manager CLI into the Smol runner VM; leave unrelated host variables out.
