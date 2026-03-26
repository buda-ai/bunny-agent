# Changelog: Docker image build performance

## `docker/sandagent-claude/Dockerfile`

- Added `# syntax=docker/dockerfile:1` and BuildKit **apt cache mounts** (`/var/cache/apt`, `/var/lib/apt/lists`) on apt-using `RUN` steps so repeated local builds reuse downloaded `.deb` and index data.
- Installed **nginx** in the first `apt-get` layer (with `--no-install-recommends`) and removed the separate nginx `RUN` to avoid an extra full `apt-get update` / install cycle.
- Documented in-file that the first build remains slow because `playwright install --with-deps chromium` pulls a large dependency set.
