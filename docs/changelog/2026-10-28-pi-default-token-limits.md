# Pi default token limits

## Request

Raise the Pi runner's fallback model defaults to a 200,000-token context
window and a 64,000-token maximum output budget. The caller confirmed gateway
support for these limits.

## Changes

- Updated the model auto-registration defaults from 128,000 / 8,192 to
  200,000 / 64,000 tokens.
- Built-in model definitions and the request protocol remain unchanged.
- Pi's context window is a shared context budget, not a separate guarantee of
  200,000 input tokens plus 64,000 output tokens.

## Validation

- Scoped typecheck was attempted but is blocked by unresolved local dependencies,
  including Pi packages and workspace package declarations.
- Existing runner-package tests were attempted: 78 tests passed, while nine
  suites could not load because local dependencies/build outputs are missing.
- No live gateway or deployment validation was performed.

## Scope

This does not change image persistence, oversized-session recovery, or deployed
runner installations.
