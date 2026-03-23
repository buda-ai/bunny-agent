# Pre-install python3, pip, and bx (brave-search-cli) in sandagent image

## Changes

- Added `python3` and `python3-pip` to the apt-get install step in all three Dockerfiles:
  - `docker/sandagent-claude/Dockerfile`
  - `docker/sandagent-claude/Dockerfile.template`
  - `docker/sandagent-claude/Dockerfile.local`
- Added `brave-search-cli` (provides the `bx` command) as a globally installed npm package in all three Dockerfiles

## Motivation

Agents running in the sandboxed environment were unable to execute Python scripts or install Python packages because `python3` and `pip` were not pre-installed. Additionally, there was no CLI tool available for quick web searches, which is a common agent workflow.

The following tools are now available in the sandbox out of the box:

| Tool | Description |
|------|-------------|
| `python3` | Python 3 interpreter for running scripts |
| `pip` / `pip3` | Python package installer |
| `bx` | `brave-search-cli` — LLM/agent-friendly search CLI |
