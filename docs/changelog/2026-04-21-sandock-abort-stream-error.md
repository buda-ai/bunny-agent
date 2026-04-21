## 2026-04-21 — Graceful stream close on user abort

- Updated SDK stream handling to treat `AbortError` as a normal user cancellation path.
- The provider now closes the language model stream instead of emitting a stream error when cancellation happens.
- This prevents abort-triggered stream errors from propagating to the UI while preserving regular error behavior for non-abort failures.
