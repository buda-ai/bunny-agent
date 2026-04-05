## Daemon volume root compatibility fix

- Fixed `resolveVolumeRoot()` in `apps/daemon/src/utils.ts` to avoid double-nesting volume paths when `SANDAGENT_ROOT` already points to a specific volume directory (for example `root=/agent` with `volume=agent`).
- Added a compatibility fallback that returns `root` instead of `root/volumes/<volume>` when the requested volume name matches the root directory name and the nested volume path does not exist.
- Added an integration regression test in `apps/daemon/src/__tests__/daemon.test.ts` to verify fs read/write APIs succeed in this configuration.
- Added support for leading-slash volume input (for example `/agent` and `/space`) by normalizing to a volume name before validation and resolution.
- Added mount-aware resolution for well-known sandbox mounts: when `/agent` or `/space` exists, daemon routes these volumes to those absolute directories (with existing scoped-volume behavior still used as fallback).
- Added a regression test to verify leading-slash volume values resolve correctly.
