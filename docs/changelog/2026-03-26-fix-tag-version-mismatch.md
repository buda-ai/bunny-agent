# 2026-03-26 Fix Tag/npm Version Mismatch in Release Workflow

## Problem

When a git tag such as `v0.9.12` was pushed, the **Release on Tag** workflow published
the wrong version to npm (e.g. `0.9.11` instead of `0.9.12`). The "Version Packages" PR
created afterwards also contained the wrong version in `package.json`.

**Root cause:** The workflow auto-generated a changeset with a `patch` bump type and ran
`pnpm changeset version`, which only increments the current version by one patch step
(e.g. `0.9.10 → 0.9.11`). It had no awareness of the actual version number encoded in the
git tag, so pushing `v0.9.12` on packages at `0.9.10` would publish `0.9.11`.

## Fix

Replaced the two steps "Create auto-changeset if none exist" and "Apply version bumps"
in `.github/workflows/release-tag.yml` with two new steps:

1. **Set exact version from tag** — parses the semver from `GITHUB_REF_NAME` (strips the
   leading `v`), then updates every `package.json` in the changeset `fixed` group to that
   exact version using a Node.js inline script.

2. **Clean up pending changesets** — deletes any leftover `.changeset/*.md` files so they
   are not included in the "Version Packages" PR.

After these steps the publish and PR-creation steps proceed as before, ensuring:
- The npm-published version **exactly matches** the git tag.
- The "Version Packages" PR bumps `package.json` to the same version.
