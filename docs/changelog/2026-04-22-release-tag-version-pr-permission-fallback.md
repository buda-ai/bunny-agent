# Release Tag Workflow: Version PR Permission Fallback

## Changes

### `.github/workflows/release-tag.yml`
- Made the `Create Version PR` step non-blocking with `continue-on-error: true`.
- Added `id: create_version_pr` so downstream logic can check the step outcome.
- Added a follow-up warning step that explains why PR creation can fail when repository settings block GitHub Actions from creating pull requests.

## Why
- The release pipeline had already published packages successfully, but then failed in the final PR creation step with:
  - `GitHub Actions is not permitted to create or approve pull requests.`
- This change keeps successful releases green while still surfacing clear guidance for enabling PR creation.
