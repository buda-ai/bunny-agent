# Add `workflow_dispatch` to Docker Publish Workflow

Date: 2026-03-26

## Overview

Added the ability to manually trigger the `.github/workflows/publish-docker.yml` workflow via GitHub's `workflow_dispatch` event.

## Changes

- Added `workflow_dispatch` to the `on:` triggers for `.github/workflows/publish-docker.yml`.
- Defined a `tag` input for `workflow_dispatch` so users can specify the semver tag to build.
- Updated the job-level `if` condition to allow the job to run when manually dispatched, in addition to the existing tag-based trigger from the Release workflow.
- Updated the "Checkout Repo" and "Extract version from tag" steps to use `inputs.tag` when manually dispatched, falling back to `github.event.workflow_run.head_branch` for the automated trigger.