# Skills

This document describes where **Skills** live, how they are loaded in SandAgent runner-cli and Docker images, and how to have Claude Code / Claude Agent SDK read them correctly.

## 1. What are Skills

Skills are capability descriptions loaded by the Claude Agent SDK from the filesystem (e.g. `*.skill.md` or folders under `.claude/skills/`). The runner-cli Claude runner uses `settingSources: ["project", "user"]`, so skills are loaded from both the **project directory** and the **user directory**.

## 2. Where the SDK reads Skills

| Source    | Path                    | Description                          |
|-----------|-------------------------|--------------------------------------|
| **Project** | `{cwd}/.claude/skills/` | Project-local (e.g. committed in git) |
| **User**    | `~/.claude/skills/`     | User-wide, applies to all projects   |

- `{cwd}`: runner working directory, set by `--cwd` or the sandbox workdir (e.g. `/workspace`).
- `~`: current user HOME (often `/root` in containers).

The SDK only uses these two paths. To expose another directory (e.g. `/skills`) you can try **symlinks** or **mounts** into one of them.

**Symlinks:** Claude Code / the Agent SDK may **not reliably follow symlinks** when scanning for skills (similar CLIs have had [symlink bugs](https://github.com/openai/codex/issues/11314)). If skills under a symlinked directory are not loaded, **copy** the skills into `.claude/skills/` (real files and folders) instead—e.g. in Docker, copy from `/opt/sandagent/templates/.claude/skills/` to the workspace on attach, rather than only linking `/skills` into `~/.claude/skills/`.

## 3. Copying Skills into the project (Docker / sandbox only)

In **Docker** (and when using sandboxes like Daytona or E2B), skills are copied into the project directory by the **sandbox attach** step, not by runner-cli.

- When the image is built with `sandagent image build --template ./templates/xxx`, the template’s `.claude/skills/` is baked into the image at `/opt/sandagent/templates/.claude/skills/`.
- On **attach**, the sandbox copies the template into the workspace (e.g. `cp -r /opt/sandagent/templates/. /workspace/`), so skills end up at **`/workspace/.claude/skills/`** (folder by folder; existing files/folders are overwritten so they are updated).
- Runner-cli has no `--template` option for `run`; template and skills flow is Docker/sandbox-only.

## 4. Using runner-cli locally (without Docker)

When you run `sandagent run` locally:

- **Project skills**: create `.claude/skills/` under your project and set `--cwd` to that project (or run from that directory).
- **User skills**: put skills under `~/.claude/skills/`; they apply to every run for that user.

No extra config is needed; the SDK loads from both locations.

## 5. Skills in Docker images

### 5.1 Baked-in template

With `sandagent image build --template ./templates/xxx`:

- The template’s `CLAUDE.md` and `.claude/` (including `.claude/skills/`) are copied into the image at **`/opt/sandagent/templates/`**.
- After the container starts, the Daytona / E2B sandbox **on attach** runs something like:
  ```bash
  cp -r /opt/sandagent/templates/. /workspace/
  ```
- So at runtime Claude reads skills from **`/workspace/.claude/skills/`** (runner cwd is `/workspace`).

### 5.2 Mounting `~/.claude`

If you mount the full **`~/.claude`** directory into the container (volume or bind mount):

- The SDK reads user skills from **`~/.claude/skills/`**.
- Changes in the mounted dir take effect without copying or rebuilding the image.

### 5.3 User-installed skills directory: `/skills` (copied at startup)

The **Dockerfile** (`docker/sandagent-claude/Dockerfile`) entrypoint **copies** `/skills` into `~/.claude/skills/` at container startup (no symlink, so the SDK reliably sees real files):

- If `/skills` exists and is non-empty: `cp -r /skills/. "$HOME/.claude/skills/"` (merge/overwrite).
- Mount your skills directory at **`/skills`**; on each container start it is copied into `~/.claude/skills/` and will be loaded by the SDK.

## 6. Path summary

| Scenario           | Path Claude reads              | Source / note                                  |
|--------------------|---------------------------------|------------------------------------------------|
| Local runner-cli   | `{cwd}/.claude/skills/`         | Project dir (create manually)                    |
| Local runner-cli   | `~/.claude/skills/`             | User HOME                                      |
| Docker template    | `/workspace/.claude/skills/`    | Copied from `/opt/sandagent/templates/` on attach |
| Docker mount       | `~/.claude/skills/`             | Mounted `~/.claude`                            |
| Docker `/skills`   | `~/.claude/skills/from-slash-skills` → `/skills` | Entrypoint symlink                    |

## 7. Related files

- **Dockerfile**: `docker/sandagent-claude/Dockerfile` — entrypoint for `~/.claude/skills` and `/skills` link.
- **Build**: `apps/runner-cli/src/build-image.ts` — copies template into image `/opt/sandagent/templates`.
- **Attach copy**: `packages/sandbox-daytona`, `packages/sandbox-e2b` — on attach, copy template (including `.claude/skills/`) to workspace so skills are in the project dir; existing folders are overwritten.

## 8. References

- [Claude Agent SDK - Agent Skills](https://docs.claude.com/en/docs/agent-sdk/skills)
- [Runner-cli README](../README.md) — `sandagent run`, `sandagent image build` usage.
