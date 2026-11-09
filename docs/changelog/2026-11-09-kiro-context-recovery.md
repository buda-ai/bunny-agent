# Recognize Kiro context-capacity errors in Pi

Date: 2026-11-09

## Request

Handle Kiro context-capacity failures in the agent harness using Pi's existing
compaction and retry mechanism, without changing the gateway's error text or
silently discarding conversation history.

## Changes

- Extend the existing managed Pi AI overflow-detection patch to recognize the
  exact gateway message: `Model context limit reached. Conversation size exceeds
  model capacity.`
- Refresh the lockfile's patch hash without changing dependency versions.
- Exercise real Pi sessions against a local HTTP fixture for successful recovery,
  bounded repeated overflow, failed summarization, unrelated HTTP errors, session
  persistence, and a tool completed before overflow.

## Behavior and limits

The gateway's message remains unchanged. Pi decides when to summarize, records the
summary in its session, and applies its existing bounded recovery behavior. There
is no new request-size threshold, image storage format, custom recovery loop, or
runner-specific stream wrapper. Existing compaction settings still apply.

This compatibility change does not guarantee that a summary or current input fits
the upstream limits. It does not add visual analysis of old images, repair
oversized-session restoration, or change how summaries retain image details.

## Validation

The focused HTTP recovery suite covers successful compact-and-retry, persistence
in the same session, repeated overflow, summary failure, image/format/auth/rate-limit
errors, and a completed tool executing once during recovery. Live provider and
product-chain verification are recorded separately from these fixture tests.
