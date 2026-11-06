/**
 * Pi 1.3 persistence adapter. This deliberately lives in Bunny's shipped code:
 * workspace pnpm patches do not reach npm consumers of the runner CLI.
 *
 * Pi exposes no serializer hook. Keep this small, per-instance bridge pinned to
 * its 1.3 persistence layout and fail explicitly if that layout changes.
 */

import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { sessionMediaCodec } from "./session-media.js";

type Entry = { type: string; message?: { role?: string } };
interface PersistenceInternals {
  fileEntries: Entry[];
  persist: boolean;
  flushed: boolean;
  sessionFile?: string;
  _loadEntries(entries: Entry[], options?: unknown): void;
  _persist(entry: Entry): void;
  _rewriteFile(exclusive?: boolean): void;
  _hasConversation(): boolean;
}

function attachMediaPersistence(manager: SessionManager): SessionManager {
  const state = manager as unknown as PersistenceInternals;
  if (
    !Array.isArray(state.fileEntries) ||
    typeof state.persist !== "boolean" ||
    typeof state.flushed !== "boolean" ||
    typeof state._loadEntries !== "function" ||
    typeof state._persist !== "function" ||
    typeof state._rewriteFile !== "function" ||
    typeof state._hasConversation !== "function"
  ) {
    throw new Error(
      "Unsupported Pi SessionManager persistence layout; expected Pi 1.3.",
    );
  }
  const loadEntries = state._loadEntries.bind(manager);
  const encode = (entry: Entry): string =>
    JSON.stringify(sessionMediaCodec.encode(entry, state.sessionFile!)) + "\n";
  state._loadEntries = (entries, options) => {
    const hydrated = state.sessionFile
      ? (sessionMediaCodec.decode(entries, state.sessionFile) as Entry[])
      : entries;
    loadEntries(hydrated, options);
  };
  state._rewriteFile = (exclusive = false) => {
    if (!state.persist || !state.sessionFile) return;
    const temporary = `${state.sessionFile}.${randomUUID()}.tmp`;
    try {
      const fd = openSync(temporary, "wx", 0o600);
      try {
        for (const entry of state.fileEntries) writeFileSync(fd, encode(entry));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      // Media writes have completed before the JSONL replacement becomes visible.
      if (exclusive) linkSync(temporary, state.sessionFile);
      else renameSync(temporary, state.sessionFile);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  };
  state._persist = (entry) => {
    if (!state.persist || !state.sessionFile) return;
    if (!state.flushed) {
      if (!state._hasConversation()) return;
      state._rewriteFile(true);
      state.flushed = true;
    } else {
      // Serialize (and publish image files) before appending the referencing line.
      appendFileSync(state.sessionFile, encode(entry));
    }
  };
  state._loadEntries(state.fileEntries);
  return manager;
}

export function createMediaSession(
  cwd: string,
  sessionDir?: string,
): SessionManager {
  return attachMediaPersistence(SessionManager.create(cwd, sessionDir));
}

export function openMediaSession(path: string): SessionManager {
  return attachMediaPersistence(SessionManager.open(path));
}

export function forkMediaSession(
  sourcePath: string,
  cwd: string,
  sessionDir?: string,
): SessionManager {
  const source = openMediaSession(sourcePath);
  const target = createMediaSession(cwd, sessionDir);
  const header = target.getHeader()!;
  header.parentSession = resolve(sourcePath);
  const state = target as unknown as PersistenceInternals;
  state._loadEntries([header, ...source.getEntries()]);
  state._rewriteFile(true);
  state.flushed = true;
  return target;
}
