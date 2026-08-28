# Non-root Nginx runtime

- Configured the CDP Nginx proxy to run as the `agent` user without `sudo` or a privileged master process.
- Moved the Nginx PID, access log, error log, and all temporary files under `/tmp/nginx`.
- Added runtime directory creation and configuration validation before Nginx starts.
- Applied the non-root configuration consistently across the published, local, and generated Dockerfiles.
