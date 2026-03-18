#!/bin/bash
set -e

echo "=== sandagent container entrypoint ==="

# 1. Start Chrome with CDP
#
# Why not just --remote-debugging-address=0.0.0.0?
# Even with that flag, Chromium validates the HTTP request's Host header against
# its allowlist (localhost / 127.0.0.1) to prevent DNS-rebinding attacks.
# A client connecting from outside the container will send Host: <container-ip>:9222,
# which Chromium rejects.
#
# Solution: run Chromium on an internal port (9223, localhost only) with
# --remote-allow-origins=* to permit any WebSocket origin, then front it with
# an nginx proxy on 0.0.0.0:9222 that rewrites the Host header to localhost.
# This makes CDP reachable externally while satisfying Chromium's security check.
CHROME_BIN=""
if command -v chromium &>/dev/null; then
  CHROME_BIN=chromium
elif command -v google-chrome &>/dev/null; then
  CHROME_BIN=google-chrome
fi

if [ -n "$CHROME_BIN" ]; then
  echo "Starting $CHROME_BIN CDP on internal :9223"
  "$CHROME_BIN" --headless --no-sandbox \
    --remote-debugging-port=9223 \
    --remote-allow-origins=* \
    2>/dev/null &

  # Wait until Chromium is ready (up to 15 s)
  for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:9223/json/version >/dev/null 2>&1; then break; fi
    sleep 0.5
  done

  # Start nginx proxy: 0.0.0.0:9222 → 127.0.0.1:9223, rewriting Host to localhost
  if command -v nginx &>/dev/null; then
    cat > /tmp/cdp-nginx.conf <<'NGINX'
events {}

http {
    server {
        listen 9222;
        location / {
            proxy_pass http://127.0.0.1:9223;
            proxy_set_header Host localhost;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
NGINX
    nginx -c /tmp/cdp-nginx.conf &
    echo "CDP available on 0.0.0.0:9222 (nginx proxy rewriting Host to localhost)"
  else
    echo "WARN: nginx not found — CDP only reachable from within the container on 127.0.0.1:9223"
  fi
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
