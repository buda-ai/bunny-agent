# 2026-04-22 Auto-Merge Version PR After CI

## Problem

The release workflow creates a version PR, but it still requires manual merge after CI passes.

## Change

Updated `.github/workflows/release-tag.yml` to automatically enable auto-merge for the generated version PR by:

- Adding an explicit step id to the `Create Version PR` step
- Enabling `peter-evans/enable-pull-request-automerge` for that PR
- Using squash merge once required checks (including CI) succeed
