// Shared types and utilities

import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

export function ok<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data, error: null };
}

export function fail(error: string): ApiEnvelope<null> {
  return { ok: false, data: null, error };
}

/**
 * Format unknown thrown values into a readable message.
 * Avoids noisy "[object Object]" in logs and API error payloads.
 */
export function formatUnknownError(err: unknown): string {
  const isObjectToStringMessage = (msg: string): boolean =>
    /^\[object [^\]]+\]$/.test(msg.trim());

  const collectErrorExtras = (e: Error): Record<string, unknown> => {
    const extra: Record<string, unknown> = {};

    for (const key of Object.getOwnPropertyNames(e)) {
      if (key === "name" || key === "message" || key === "stack") continue;
      extra[key] = (e as unknown as Record<string, unknown>)[key];
    }

    // Some SDKs put diagnostics on inherited properties; keep common keys.
    for (const key of ["code", "status", "response", "body", "data"]) {
      if (key in (e as unknown as Record<string, unknown>) && !(key in extra)) {
        extra[key] = (e as unknown as Record<string, unknown>)[key];
      }
    }

    return extra;
  };

  const errorRecord = (e: Error): Record<string, unknown> => ({
    name: e.name,
    message: e.message,
    ...(isObjectToStringMessage(e.message)
      ? {
          note: "Upstream error message was stringified object",
        }
      : {}),
    ...(e.cause !== undefined ? { cause: formatUnknownError(e.cause) } : {}),
    ...(Object.keys(collectErrorExtras(e)).length > 0
      ? { extra: collectErrorExtras(e) }
      : {}),
  });

  if (err == null) return String(err);
  if (typeof err === "string") return err;
  if (typeof err === "number" || typeof err === "boolean") return String(err);
  if (err instanceof Error) {
    try {
      return JSON.stringify(errorRecord(err));
    } catch {
      const message = err.message?.trim() ?? "";
      return `${err.name}: ${message || "(no message)"}`;
    }
  }
  if (typeof err === "object") {
    try {
      return JSON.stringify(err, (_key, value) => {
        if (value instanceof Error) return errorRecord(value);
        return value;
      });
    } catch {
      return "Unserializable object error";
    }
  }
  return String(err);
}

export interface AppState {
  root: string;
  volumesRoot: string;
}

/**
 * Resolve volume root: if volume given, use volumesRoot/volume; otherwise use root.
 */
export function resolveVolumeRoot(state: AppState, volume?: string): string {
  const normalizedRoot = path.resolve(state.root);
  if (!volume) return state.root;
  const normalizedVolume = normalizeVolumeName(volume);
  validateVolumeName(normalizedVolume);
  const scopedVolumeRoot = path.resolve(state.volumesRoot, normalizedVolume);

  const mountVolumeRoot = path.resolve(path.sep, normalizedVolume);
  if (
    isWellKnownMountVolume(normalizedVolume) &&
    existsSync(mountVolumeRoot) &&
    (volume.startsWith("/") || !existsSync(scopedVolumeRoot))
  ) {
    return mountVolumeRoot;
  }

  // Backward compatibility:
  // if BUNNY_AGENT_ROOT already points to the requested volume root
  // (e.g. root=/agent and volume=agent), prefer root over root/volumes/agent.
  if (
    path.basename(normalizedRoot) === normalizedVolume &&
    !existsSync(scopedVolumeRoot)
  ) {
    return normalizedRoot;
  }

  return scopedVolumeRoot;
}

function normalizeVolumeName(name: string): string {
  return name.replace(/^\/+/, "");
}

function isWellKnownMountVolume(name: string): boolean {
  return name === "agent" || name === "space";
}

/**
 * Resolve a user-provided path safely under a root, preventing traversal.
 */
export function resolveUnderRoot(root: string, raw: string): string {
  if (!raw.trim()) throw new AppError(400, "empty path");
  // Normalize root to strip trailing slashes for consistent comparison
  const normalizedRoot = path.resolve(root);
  const normalized = path.normalize(raw);
  // Reject absolute paths that are outside root
  if (
    path.isAbsolute(normalized) &&
    !normalized.startsWith(normalizedRoot + path.sep) &&
    normalized !== normalizedRoot
  ) {
    throw new AppError(400, `invalid path: ${raw}`);
  }
  const resolved = path.resolve(normalizedRoot, normalized.replace(/^\/+/, ""));
  if (
    resolved !== normalizedRoot &&
    !resolved.startsWith(normalizedRoot + path.sep)
  ) {
    throw new AppError(400, `path traversal rejected: ${raw}`);
  }
  return resolved;
}

function validateVolumeName(name: string): void {
  if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new AppError(400, `invalid volume: ${name}`);
  }
}

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Simple MIME-type lookup by file extension */
const MIME_MAP: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  yaml: "text/yaml",
  yml: "text/yaml",
  sh: "text/x-shellscript",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

export function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}
