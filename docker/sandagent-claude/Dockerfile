# syntax=docker/dockerfile:1
# SandAgent Image (vikadata/sandagent)
# Pre-installs runner-cli, @sandagent/daemon (HTTP API), and @anthropic-ai/claude-agent-sdk
# Compatible with both Daytona Snapshots and E2B custom templates
#
# E2B: Use Template.fromDockerfile() to parse this Dockerfile
# Daytona: Use daytona snapshot push or daytona snapshot create --dockerfile
#
# Build with BuildKit (default in Docker 23+): enables apt cache mounts for faster rebuilds.
# First build is still slow: `playwright install --with-deps chromium` pulls many .deb packages.

FROM node:20-slim

# Version of @sandagent/runner-cli to install.
# Override at build time: docker build --build-arg RUNNER_CLI_VERSION=1.2.3 ...
ARG RUNNER_CLI_VERSION=0.9.19-beta.3

LABEL org.opencontainers.image.title="sandagent"
LABEL org.opencontainers.image.description="SandAgent with Claude Agent SDK pre-installed"
LABEL org.opencontainers.image.version="$RUNNER_CLI_VERSION"

# Install common tools + nginx (CDP proxy). Apt cache mounts speed up repeated local builds.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    for i in 1 2 3; do \
    apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    sudo \
    tmux \
    python3 \
    python3-pip \
    nginx \
    && rm -rf /var/lib/apt/lists/* \
    && break || sleep 5; \
    done

# Create agent user with home directory
RUN useradd -m -d /agent -s /bin/bash agent && \
    echo "agent ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create directories with proper permissions
RUN mkdir -p /workspace && chown agent:agent /workspace
WORKDIR /workspace

# Pre-install dependencies to /opt/sandagent (won't be overwritten by volume mount)
RUN mkdir -p /opt/sandagent && \
    cd /opt/sandagent && \
    npm init -y && \
    npm install --no-audit --no-fund \
    @anthropic-ai/claude-agent-sdk \
    @sandagent/runner-cli@${RUNNER_CLI_VERSION} \
    @sandagent/daemon@${RUNNER_CLI_VERSION} \
    playwright && \
    rm package.json package-lock.json && \
    npm cache clean --force && \
    chown -R agent:agent /opt/sandagent

# Install Playwright Chromium browser and system dependencies.
# Refresh apt signing keys before Playwright runs apt-get again: under buildx+QEMU
# (linux/amd64 on Apple Silicon), apt can fail with "invalid signature" without this.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/sandagent/pw-browsers
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      debian-archive-keyring \
      gnupg \
    && cd /opt/sandagent \
    && DEBIAN_FRONTEND=noninteractive npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

RUN npm install simple-git brave-search-cli -g

# Create init script to copy deps to workspace on startup
RUN echo '#!/bin/bash\n\
if [ ! -d "/workspace/node_modules/@sandagent" ]; then\n\
  echo "Copying sandagent dependencies to workspace..."\n\
  mkdir -p /workspace/node_modules\n\
  cp -r /opt/sandagent/node_modules/* /workspace/node_modules/\n\
fi\n\
exec "$@"' > /usr/local/bin/sandagent-init && \
    chmod +x /usr/local/bin/sandagent-init

# Create sandagent as system command in /usr/local/bin
RUN echo '#!/usr/bin/env node' > /usr/local/bin/sandagent && \
    echo 'import("/opt/sandagent/node_modules/@sandagent/runner-cli/dist/bundle.mjs")' >> /usr/local/bin/sandagent && \
    chmod +x /usr/local/bin/sandagent

# sandagent-daemon: HTTP gateway (fs, git, volumes, /api/coding/run)
RUN echo '#!/usr/bin/env node' > /usr/local/bin/sandagent-daemon && \
    echo 'import("/opt/sandagent/node_modules/@sandagent/daemon/dist/bundle.mjs")' >> /usr/local/bin/sandagent-daemon && \
    chmod +x /usr/local/bin/sandagent-daemon

# Entrypoint: copy /skills, start daemon + CDP, then exec CMD
RUN printf '%s\n' \
    '#!/bin/bash' \
    'mkdir -p "$HOME/.claude/skills"' \
    'if [ -d /skills ] && [ -n "$(ls -A /skills 2>/dev/null)" ]; then' \
    '  cp -r /skills/. "$HOME/.claude/skills/"' \
    '  echo "Copied /skills to $HOME/.claude/skills"' \
    'fi' \
    'sandagent-daemon &' \
    'start-cdp' \
    'exec "$@"' > /usr/local/bin/sandagent-entrypoint && \
    chmod +x /usr/local/bin/sandagent-entrypoint

# Set environment variables
ENV NODE_PATH=/opt/sandagent/node_modules
ENV PATH=/usr/local/bin:$PATH
ENV SANDAGENT_ROOT=/agent
ENV SANDAGENT_DAEMON_HOST=0.0.0.0
ENV SANDAGENT_DAEMON_PORT=3080

# Suppress D-Bus errors in headless Chromium (no bus in containers)
ENV DBUS_SESSION_BUS_ADDRESS=/dev/null

# Create CDP (Chrome DevTools Protocol) startup script
# Use nginx to proxy and rewrite Host header to localhost,
# bypassing Chromium's Host header security check
RUN echo 'server {\n\
    listen 9222;\n\
    location / {\n\
        proxy_pass http://127.0.0.1:9223;\n\
        proxy_set_header Host localhost;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Upgrade $http_upgrade;\n\
        proxy_set_header Connection "upgrade";\n\
    }\n\
}' > /etc/nginx/conf.d/cdp-proxy.conf && \
    rm -f /etc/nginx/sites-enabled/default

RUN echo '#!/bin/bash\n\
set -e\n\
CHROME_BIN=$(node -e "console.log(require('"'"'playwright'"'"').chromium.executablePath())")\n\
"$CHROME_BIN" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage --disable-software-rasterizer \\\n\
  --remote-debugging-port=9223 --remote-allow-origins=* 2>/dev/null &\n\
for i in $(seq 1 30); do\n\
  if curl -s http://127.0.0.1:9223/json/version > /dev/null 2>&1; then break; fi\n\
  sleep 0.5\n\
done\n\
sudo nginx\n\
echo "CDP available on 0.0.0.0:9222 (nginx proxy rewriting Host to localhost)"' > /usr/local/bin/start-cdp && \
    chmod +x /usr/local/bin/start-cdp

# Switch to agent user
USER agent

# Template files (optional, added by build script)

# Copy /skills into ~/.claude/skills at startup, then keep container running (for Daytona)
ENTRYPOINT ["/usr/local/bin/sandagent-entrypoint"]

# Expose sandagent-daemon HTTP (healthz, fs, git, coding) and CDP (browser automation)
EXPOSE 3080
EXPOSE 9222

# Keep container alive (daemon + CDP started by entrypoint)
CMD ["sleep", "infinity"]
