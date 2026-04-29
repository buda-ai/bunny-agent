# 2026-04-29 - Fix fs/list symlink error

- Fixed an issue in `fsList` where encountering a broken symlink would cause a "Cannot read properties of null (reading 'mtimeMs')" error, because `fs.stat` returns `null` but the code attempted to access `.mtimeMs` on it unconditionally.
