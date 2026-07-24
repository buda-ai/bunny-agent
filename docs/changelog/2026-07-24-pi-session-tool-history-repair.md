# Pi session tool-history repair

- Repair unsafe tool call/result history in Pi's request-time session context without rewriting the append-only session JSONL or changing the session ID.
- Remove blank, duplicate, incomplete, orphaned, out-of-order, and name-mismatched tool history while preserving valid assistant text and complete tool pairs.
- Keep session loading, resume behavior, and fresh-session input behavior unchanged.
