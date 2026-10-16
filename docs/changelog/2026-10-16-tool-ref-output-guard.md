# Bound external tool-ref output

- Added protocol-independent tool-output protection to the manager package,
  already shared by the Pi and Claude runners. No MCP adapter internals or new
  dependencies are used.
- Bound model-visible response text to 50 KiB / 2,000 lines, including the
  truncation notice. Full responses are saved under the runner workspace's
  `.bunny/tool-output` directory with private file permissions.
- Applied protection to HTTP/module successes, non-2xx bodies, and transport
  exceptions in both tool-ref wrappers. Small outputs retain existing behavior.
- Passed each runner's working directory to the tool-ref builders. Spill files
  remain available on resume; failed writes produce an explicit bounded notice.
- Added shared utility tests for unchanged small outputs, exact thresholds,
  oversized single-line JSON, UTF-8 boundaries, line limits, full-file fidelity,
  private permissions, concurrent writes, and storage failure.
- Added Pi/Claude integration regressions for large successful/error HTTP
  responses and thrown exceptions, plus concurrent Pi module results.
- Verification: the 30 targeted tests pass; manager and both runner packages
  build; both runner typechecks and formatting checks pass.
- Replayed the actual uploaded oversized result through the built guard:
  4,953,048 original bytes become a 51,198-byte model-visible preview, and the
  saved full response matches the original exactly. Replay artifacts were
  created under `/tmp` and removed after validation.
- Full package tests: manager 132/132 and Claude 74/74 pass. Pi passes 209/210;
  the existing native MCP integration test times out at its 20-second limit,
  while all tool-ref output regressions pass. The isolated integration test also
  exceeds that limit.
- Confirmed the MCP timing issue on unmodified main Pi source copied to `/tmp`:
  a diagnostic copy with a 60-second timeout passes in 26.5 seconds. The repository
  integration test and its original 20-second timeout remain unchanged.
- Updated both runner READMEs with preview limits, retrieval instructions,
  persistence, write-failure handling, and per-response scope. Existing session
  history is not rewritten, and HTTP download memory is not capped by this guard.
- Added a patch changeset for the shared manager package and the published CLI
  and daemon that embed the updated runners.
