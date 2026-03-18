#!/bin/bash
set -e

echo "=== sandagent container entrypoint ==="

# 1. Start Chrome with CDP (headless, port 9222)
if command -v chromium &>/dev/null; then
  echo "Starting chromium CDP on :9222"
  chromium --headless --no-sandbox --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 &
elif command -v google-chrome &>/dev/null; then
  echo "Starting chrome CDP on :9222"
  google-chrome --headless --no-sandbox --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 &
else
  echo "WARN: no chrome/chromium found, CDP disabled"
fi

# 2. Start git_daemon sidecar (Rust binary, port 8001)
if command -v git_daemon &>/dev/null; then
  echo "Starting git_daemon on :8001"
  SANDOCK_DAEMON_PORT=8001 git_daemon &
else
  echo "WARN: git_daemon not found, git sidecar disabled"
fi

# 3. Start sandagent-daemon (unified gateway, port 3080)
echo "Starting sandagent-daemon on :3080"
exec sandagent-daemon
