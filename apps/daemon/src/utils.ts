// Shared types and utilities

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
  if (!volume) return state.root;
  validateVolumeName(volume);
  return path.join(state.volumesRoot, volume);
}

/**
 * Resolve a user-provided path safely under a root, preventing traversal.
 */
export function resolveUnderRoot(root: string, raw: string): string {
  if (!raw.trim()) throw new AppError(400, "empty path");
  const normalized = path.normalize(raw);
  // Reject absolute paths and traversal
  if (path.isAbsolute(normalized) && !normalized.startsWith(root)) {
    throw new AppError(400, `invalid path: ${raw}`);
  }
  const resolved = path.resolve(root, normalized.replace(/^\/+/, ""));
  if (!resolved.startsWith(root)) {
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
