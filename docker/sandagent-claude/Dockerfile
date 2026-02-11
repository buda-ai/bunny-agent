# SandAgent Image (vikadata/sandagent)
# Pre-installs runner-cli and @anthropic-ai/claude-agent-sdk
# Compatible with both Daytona Snapshots and E2B custom templates
#
# E2B: Use Template.fromDockerfile() to parse this Dockerfile
# Daytona: Use daytona snapshot push or daytona snapshot create --dockerfile

FROM node:20-slim

LABEL org.opencontainers.image.title="sandagent"
LABEL org.opencontainers.image.description="SandAgent with Claude Agent SDK pre-installed"
LABEL org.opencontainers.image.version="0.1.0"

# Install common tools (with retry for network issues)
RUN for i in 1 2 3; do \
    apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && break || sleep 5; \
    done

# Create directories with proper permissions
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

# Pre-install dependencies to /opt/sandagent (won't be overwritten by volume mount)
RUN mkdir -p /opt/sandagent && \
    cd /opt/sandagent && \
    npm init -y && \
    npm install --no-audit --no-fund \
    @anthropic-ai/claude-agent-sdk \
    @sandagent/runner-cli@latest && \
    rm package.json package-lock.json && \
    npm cache clean --force

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

# Set environment variables
ENV NODE_PATH=/opt/sandagent/node_modules
ENV PATH=/usr/local/bin:$PATH

# Template files (optional, added by build script)

# Keep container running (for Daytona)
CMD ["sleep", "infinity"]
