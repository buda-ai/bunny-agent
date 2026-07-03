---
"@bunny-agent/daemon": minor
"@bunny-agent/manager": minor
"@bunny-agent/runner-cli": minor
"@bunny-agent/sandbox-e2b": minor
"@bunny-agent/sandbox-sandock": minor
"@bunny-agent/sandbox-daytona": minor
"@bunny-agent/sdk": minor
---

Thread the pi-runner `forkFrom` option all the way from the CLI (`--fork-from`), the SDK (`createBunnyAgent({ forkFrom })`) and the manager (`StreamInput.forkFrom` / `BunnyAgentCodingRunBody.forkFrom`) down into the daemon `/api/coding/run` request body. When set, the pi runner snapshot-clones the source pi session and continues chat on top of the copied history; the new session id flows back through the existing `message-metadata.sessionId` channel. Mutually exclusive with `resume`.
