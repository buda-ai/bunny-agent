# Session changelog — 2026-03-23 (pi runner skill-path logging)

## Changes

- **`packages/runner-pi`:** When `--skill-path` / `skillPaths` is non-empty, log to **stderr** with prefix `[sandagent:pi]`:
  - Runner line: `cwd` and JSON `skillPaths`.
  - After `loadSkills`: resolved path, `exists: yes|no`, skill count, names, and Pi diagnostics (missing paths, validation warnings, collisions).
- Restored behavior: do **not** replace the system prompt with a generic line when `systemPrompt` is omitted (preserves `<available_skills>`).
