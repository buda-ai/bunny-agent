---
"@bunny-agent/runner-cli": patch
"@bunny-agent/daemon": patch
---

The Pi runner now uses Pi's own extension hooks and resource loader instead of
wrapping each tool. Secret values from the runner `env` are redacted from every
tool result — tool refs and MCP tools included, which previously reached the
model unredacted — and from the result details stored in session files, where
the MCP adapter kept the raw server response. MCP tools are now gated by tool
approval like the other tools. Bash commands that dump the environment are blocked without first asking
for approval.

Sessions, settings, skills and extensions now all use Pi's agent directory
(`~/.pi/agent`, override with `PI_CODING_AGENT_DIR`). Published builds already
kept sessions there, but read skills, extensions and `AGENTS.md` /
`APPEND_SYSTEM.md` from `~/.bunny/agent`; move anything you keep in
`~/.bunny/agent` to `~/.pi/agent`.
