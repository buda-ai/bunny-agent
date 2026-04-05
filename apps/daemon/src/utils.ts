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
  // if SANDAGENT_ROOT already points to the requested volume root
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
