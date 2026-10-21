# Pi runner: use Pi's hooks and resource loader instead of Bunny wrappers

## Why

The Pi runner reimplemented three things Pi's SDK already provides, and the
copies had gaps:

- Tool approval wrapped each tool's `execute`. Only tools the runner built
  itself were wrapped, so it had to rebuild Pi's built-in tools just to wrap
  them, and tools registered by extensions (the MCP adapter) were never gated.
- Secret redaction wrapped only `bash` and `read`. Tool refs, MCP tools, web
  fetches and every other tool returned the runner `env` values to the model
  verbatim.
- `BunnyAgentResourceLoader` re-implemented `ResourceLoader` to add skill paths
  and an appended system prompt, both of which `DefaultResourceLoader` accepts
  as options. It also hard-coded `~/.bunny/agent` for resources while sessions
  and settings used Pi's agent dir.

The pi-coding-agent patch also renamed Pi's config dir to `.bunny` through
`piConfig`. That only took effect inside this repository: the daemon bundles
Pi and the published runner-cli depends on unpatched Pi, so both used `~/.pi`.

## Changes

- Approval is an inline extension on Pi's `tool_call` hook
  (`createToolApprovalExtension`). It skips `ask_user_question`, which waits on
  the bridge itself, and calls another tool made (codemode), whose caller was
  already approved.
- `createSecretGuardExtension` blocks env-dump bash commands on `tool_call`
  and redacts `env` values from every tool result on `tool_result`: the text
  content, plus `details` (the MCP adapter stores the raw server result there,
  and pi writes it to the session file) and `structuredContent` (what codemode
  scripts receive), which are masked in place rather than dropped. Results
  without a secret are left untouched.
- The env-dump rule no longer blocks `env NAME=value cmd` or `env -u NAME cmd`,
  which only run `cmd` with a changed environment. `env` is blocked when it
  prints the environment, including `env FOO=1 printenv`.
- The bash override is `createBashToolDefinition` with a `spawnHook`; the read
  override is gone.
- `createPiResourceLoader` builds `DefaultResourceLoader` with the caller's
  skill paths, the appended prompt and the extensions. Skill discovery keeps
  the previous set (agent dir, project `.pi/skills`, caller paths): Pi's
  `~/.agents/skills` and ancestor `.agents/skills` discovery would pull a
  user's personal skills into local-mode agents.
- One `getAgentDir()` and one `SettingsManager` per run, shared by the session,
  the session manager and the resource loader.
- `piConfig` hunk removed from the pi-coding-agent patch.

## Behavior changes

- Under approval, a batch of parallel tool calls is approved one call at a
  time (Pi runs `tool_call` handlers per call), then runs together.
  Previously every call in the batch asked at once.
- MCP tools are gated in non-yolo runs.
- `env | ...`, `printenv`, `export -p`, `declare -x` in bash return an error
  result without asking for approval first.
- Resources move from `~/.bunny/agent` to `~/.pi/agent`.

## Not changed

- `agent_end` handling: `session.prompt()` already resolves after
  `agent_settled`, so switching the loop to that event would change nothing.
- Settings still come from `SettingsManager.create(cwd, agentDir)`; an
  in-memory manager would drop users' `settings.json`.

## Verification

- `pi-runner.hooks.test.ts`: the real runner against a scripted
  OpenAI-compatible endpoint. On `main`, the tool-ref redaction, env-dump,
  `env NAME=value cmd` and `PI_CODING_AGENT_DIR` cases fail; all pass here. It
  also checks the caller's system prompt opens the prompt the model receives.
- `tool-approval.test.ts`: real Pi sessions with a faux model; extension tools
  are gated, timeouts and aborts block the call, nested calls and
  `ask_user_question` are asked once, and two parallel calls are asked one
  after the other and run once both are approved.
- `tool-overrides.test.ts`: the env-dump rule on both sides (12 commands it
  blocks, 8 it allows); `redactSecrets` cases moved here from
  `pi-runner.test.ts`, which tested the same function a second time.
- `secret-guard.test.ts`: real Pi sessions; a tool shaped like an MCP result
  (secret in content, `details` and `structuredContent`) leaves no secret in
  the model context or the stored session, and programmatic callers get the
  structured content masked rather than dropped.
- `pi-resource-loader.test.ts`: fails if Pi's default skill discovery is
  turned back on.
- Built daemon with a real model (`openai:gpt-6.1-sol`): a file containing a
  secret was quoted back as `***`, and the session file has no secret;
  a non-yolo bash call waited for its approval file and ran after approval;
  sessions resumed by id; a session created by the published
  `@bunny-agent/daemon@0.9.62-release.2` resumed on the new build; skills from
  `skillPaths` load and are followed.
