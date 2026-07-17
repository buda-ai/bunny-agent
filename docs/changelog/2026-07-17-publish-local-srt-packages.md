# Publish Local and SRT Sandbox Packages

## Session Log

- Added `@bunny-agent/sandbox-local` and `@bunny-agent/sandbox-srt` to the
  explicit package list in the tag release workflow.
- Added both packages to the Changesets fixed group so tag releases assign
  them the same version as `@bunny-agent/manager` and `@bunny-agent/sdk`.
- Aligned both package manifests with the current fixed-group version,
  `0.9.52`.
- Future tag releases now publish the SDK and both adapters with one shared
  version, ensuring the SDK's internal dependencies are available from npm.
- The omission was detected after `@bunny-agent/sdk@0.9.52` referenced the two
  adapters while neither package had been published to npm.

## Validation

- Parsed `.github/workflows/release-tag.yml` with the repository's installed
  YAML parser.
- Ran `pnpm lint` successfully.
- Built `@bunny-agent/manager`, `@bunny-agent/sandbox-local`, and
  `@bunny-agent/sandbox-srt` in dependency order.
- Passed all 24 `sandbox-local` tests and all 7 runnable `sandbox-srt` tests;
  7 environment-dependent SRT tests remained skipped.
- Packed both adapters locally and confirmed pnpm rewrites their `workspace:*`
  dependencies to `0.9.52`, matching `@bunny-agent/manager`.
- Confirmed both package paths and names match their package manifests and
  the Changesets fixed group.
