## 1. Proposal and Documentation

- [x] 1.1 Write proposal, design, tasks, and delta specs directly without OpenSpec initialization.
- [x] 1.2 Document ReadImage usage, permissions, model capability declarations, and OCR compatibility.
- [x] 1.3 Start the English session changelog.
- [x] 1.4 Validate the change with strict non-interactive OpenSpec validation.

## 2. Pi Runtime

- [x] 2.1 Implement and register `read_image` using Pi's native image handling and resizing.
- [x] 2.2 Reject invalid images and models without declared image input.
- [x] 2.3 Integrate existing allowlist, approval, cancellation, and text redaction behavior.
- [x] 2.4 Guard uploaded images for text models while preserving labels and ordering.

## 3. Verification

- [x] 3.1 Add unit coverage for images, errors, capabilities, permissions, denial, cancellation, and upload order.
- [x] 3.2 Verify image bytes through built CLI, daemon, and SDK using a local protocol server.
- [x] 3.3 Verify upload and restored-session image transport.
- [ ] 3.4 Add and run opt-in live vision tests when credentials are available; record any skipped proof.
- [x] 3.5 Verify existing bash/MCP registration and invocation; record actual OCR proof separately.
- [x] 3.6 Run relevant tests, type checks, builds, and `git diff --check`, and update the changelog with results.

Live tests have been added and attempted. Task 3.4 remains pending because the
endpoint returns HTTP 403 `unsupported_country_region_territory`; local transport
proof does not replace live semantic verification. Actual OCR recognition has
not been tested and no OCR backend is introduced by this change.

A user-requested retry exercised both live file and upload cases. Both were
rejected again with `unsupported_country_region_territory`; task 3.4 remains
pending until the tests run against an accessible vision endpoint.
