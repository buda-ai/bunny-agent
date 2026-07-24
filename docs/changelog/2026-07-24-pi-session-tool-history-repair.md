# Pi session tool-history repair

- Repair unsafe tool call/result history in Pi's request-time session context without rewriting the append-only session JSONL or changing a valid session ID.
- Drop blank, duplicate, incomplete, orphaned, out-of-order, and name-mismatched tool history while preserving valid assistant text and complete tool pairs.
- Sanitize structured fallback tool parts at the Bunny SDK boundary using the same empty, duplicate, and input-only call rules migrated out of Buda.
- Carry a caller-selected recent transcript fallback alongside resumed requests so Pi can rebuild a persistent session when the requested session file no longer exists.
- Keep normal resume requests incremental: the fallback transcript is used only after Pi confirms that the requested session cannot be found.
