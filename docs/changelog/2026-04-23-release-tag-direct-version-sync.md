# 2026-04-23 Release Tag Direct Version Sync

## Problem

Version package synchronization still depended on a generated PR and could be blocked by approval requirements.

## Change

Updated `.github/workflows/release-tag.yml` to remove the version PR creation/auto-merge flow.

The tag release workflow now commits version-sync changes and pushes them directly to `main` after publish, so version updates run automatically when a tag is created.
