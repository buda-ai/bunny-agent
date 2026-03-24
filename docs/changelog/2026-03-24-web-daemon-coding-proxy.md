# Web: proxy route for daemon `POST /api/coding/run` (2026-03-24)

- Added `POST /api/daemon/coding-run` in `apps/web` (Node runtime): streams the request body to `SANDAGENT_DAEMON_URL` (default `http://127.0.0.1:3080`) `/api/coding/run` and returns the upstream stream.
- Enabled when `NODE_ENV !== production`; in production requires `SANDAGENT_ENABLE_DAEMON_PROXY=1`.
