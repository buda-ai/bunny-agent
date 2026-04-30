# Session changelog - 2026-04-30 daemon isomorphic-git

## Summary

Reimplemented the daemon Git API on top of `isomorphic-git` instead of spawning
the system `git` binary.

## Changes

### `apps/daemon/src/routes/git.ts`
- Replaced `execFile("git", ...)` usage with `import * as git from "isomorphic-git"`
  and `import http from "isomorphic-git/http/node"`.
- Updated route handler signatures to use the shared Git request types from
  `apps/daemon/src/shared/git-types.ts`.
- Added a compatibility dispatcher for the existing `/api/git/exec` allowlist,
  including common `status`, `log`, `branch`, `checkout`, `add`, `commit`,
  `reset`, `init`, `rev-parse`, `fetch`, `pull`, `push`, `merge`, `remote`,
  `tag`, and `ls-files` forms.
- Kept the public `GitCommandResult` response shape for command-style endpoints.
  Unsupported flag combinations now return nonzero command results instead of
  relying on a Git CLI process failure.

### `apps/daemon/package.json` and `pnpm-lock.yaml`
- Added `isomorphic-git` as a daemon runtime dependency.

### `apps/daemon/src/__tests__/daemon.test.ts`
- Added coverage for `/api/git/exec` add, commit, log, and ls-files behavior.

### `apps/daemon/README.md` and `docs/ARCHITECTURE.md`
- Updated daemon Git implementation documentation from Git CLI spawning to
  `isomorphic-git`.
