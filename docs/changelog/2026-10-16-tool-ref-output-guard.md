# Bound external tool-ref output

- Added protocol-independent tool-output protection to the manager package,
  already shared by the Pi and Claude runners. No MCP adapter internals or new
  dependencies are used.
- Bound model-visible response text to 50 KiB / 2,000 lines, including the
  truncation notice. Full responses are saved in the OS temporary directory
  with private file permissions, matching Pi's native output-file behavior.
- Applied protection to HTTP/module successes, non-2xx bodies, and transport
  exceptions in both tool-ref wrappers. Small outputs retain existing behavior.
- Failed writes produce an explicit bounded notice. Output-file cleanup follows
  the OS or sandbox temporary-directory lifecycle; no Bunny TTL or session-end
  deletion is added, and file availability after restart/resume is not guaranteed.
- Added shared utility tests for unchanged small outputs, exact thresholds,
  oversized single-line JSON, UTF-8 boundaries, line limits, full-file fidelity,
  private permissions, concurrent writes, and storage failure.
- Added Pi/Claude integration regressions for large successful/error HTTP
  responses and thrown exceptions, plus concurrent Pi module results.
- Verification: the 30 targeted tests pass; manager and both runner packages
  build; both runner typechecks and formatting checks pass.
- Replayed the actual uploaded oversized result through the built guard:
  4,953,048 original bytes become a 51,200-byte model-visible preview, and the
  saved full response matches the original exactly. Verified the final file is
  directly in `os.tmpdir()` with mode 0600; removed it after validation.
- Full package tests before the temporary-directory follow-up: manager 132/132
  and Claude 74/74 pass. Pi passes 209/210;
  the existing native MCP integration test times out at its 20-second limit,
  while all tool-ref output regressions pass. The isolated integration test also
  exceeds that limit.
- Confirmed the MCP timing issue on unmodified main Pi source copied to `/tmp`:
  a diagnostic copy with a 60-second timeout passes in 26.5 seconds. The repository
  integration test and its original 20-second timeout remain unchanged.
- Updated both runner READMEs with preview limits, retrieval instructions,
  temporary-file retention, write-failure handling, and per-response scope.
  Existing session history is not rewritten, and HTTP download memory is not
  capped by this guard.
- Added a patch changeset for the shared manager package and the published CLI
  and daemon that embed the updated runners.
- Aligned output storage with Pi native behavior at the user's request: use
  random exclusive files directly in `os.tmpdir()` with mode 0600, remove the
  workspace output directory and the new cwd builder options, and test against
  an isolated OS temporary directory. All 97 related tests pass after the
  adjustment, including the 30 output-guard/tool-ref tests and both runner
  regression suites. All three affected packages typecheck and build.
