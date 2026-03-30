# Fix `created_at` epoch in fs list

Date: 2026-03-30

## Overview
In Docker/sandbox environments, some filesystems do not support `birthtime`, causing Node to return an epoch timestamp (`1970-01-01...`) for `created_at` in the daemon `fs/list` API.

## Changes
- Added a `birthtimeMs` validity check and fall back to `ctimeMs` when `birthtime` is missing/epoch.
- Updated the daemon `fs list` test to ensure `created_at` never returns the epoch value.

