import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AppState } from "../utils.js";
import {
  ensureDir,
  ok,
  resolveUnderRoot,
  resolveVolumeRoot,
} from "../utils.js";

// --- Query types ---

interface PathQuery {
  volume?: string;
  path: string;
}

interface ListQuery {
  volume?: string;
  path?: string;
}

interface FindQuery {
  volume?: string;
  path?: string;
  pattern: string;
  limit?: number;
}

// --- Body types ---

interface WriteBody {
  volume?: string;
  path: string;
  content: string;
  create_dirs?: boolean;
}

interface RemoveBody {
  volume?: string;
  path: string;
  recursive?: boolean;
}

interface MkdirBody {
  volume?: string;
  path: string;
  recursive?: boolean;
}

interface MoveCopyBody {
  volume?: string;
  from: string;
  to: string;
  create_dirs?: boolean;
}

// --- Handlers ---

export async function fsList(state: AppState, q: ListQuery) {
  const root = resolveVolumeRoot(state, q.volume);
  const target = resolveUnderRoot(root, q.path ?? ".");
  const entries = await fs.readdir(target, { withFileTypes: true });
  const result = await Promise.all(
    entries.map(async (e) => {
      const fullPath = path.join(target, e.name);
      const stat = await fs.stat(fullPath).catch(() => null);
      return {
        name: e.name,
        path: fullPath,
        is_dir: e.isDirectory(),
        size: stat?.isFile() ? stat.size : 0,
        created_at: stat?.birthtime?.toISOString() ?? null,
        modified_at: stat?.mtime?.toISOString() ?? null,
      };
    }),
  );
  result.sort((a, b) => a.name.localeCompare(b.name));
  return ok(result);
}

export async function fsRead(state: AppState, q: PathQuery) {
  const root = resolveVolumeRoot(state, q.volume);
  const target = resolveUnderRoot(root, q.path);
  const content = await fs.readFile(target, "utf-8");
  return ok({ path: target, content });
}

/**
 * Read a file as raw binary Buffer (for serving images, PDFs, etc.).
 * Unlike fsRead which returns UTF-8 text inside JSON, this returns { path, buffer }
 * so the HTTP layer can stream the raw bytes with the correct Content-Type.
 */
export async function fsDownload(
  state: AppState,
  q: PathQuery,
): Promise<{ path: string; buffer: Buffer }> {
  const root = resolveVolumeRoot(state, q.volume);
  const target = resolveUnderRoot(root, q.path);
  const buffer = await fs.readFile(target);
  return { path: target, buffer };
}

export async function fsStat(state: AppState, q: PathQuery) {
  const root = resolveVolumeRoot(state, q.volume);
  const target = resolveUnderRoot(root, q.path);
  const stat = await fs.stat(target);
  return ok({
    path: target,
    is_dir: stat.isDirectory(),
    size: stat.isFile() ? stat.size : 0,
  });
}

export async function fsExists(state: AppState, q: PathQuery) {
  const root = resolveVolumeRoot(state, q.volume);
  const target = resolveUnderRoot(root, q.path);
  const exists = await fs.stat(target).then(
    () => true,
    () => false,
  );
  return ok({ path: target, exists });
}

export async function fsFind(state: AppState, q: FindQuery) {
  const root = resolveVolumeRoot(state, q.volume);
  const start = resolveUnderRoot(root, q.path ?? ".");
  const needle = q.pattern.toLowerCase();
  const limit = Math.min(Math.max(q.limit ?? 200, 1), 2000);
  const result: {
    name: string;
    path: string;
    is_dir: boolean;
    size: number;
  }[] = [];
  const queue = [start];

  while (queue.length > 0 && result.length < limit) {
    const dir = queue.shift()!;
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const fullPath = path.join(dir, name);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat?.isDirectory()) queue.push(fullPath);
      if (name.toLowerCase().includes(needle)) {
        result.push({
          name,
          path: fullPath,
          is_dir: stat?.isDirectory() ?? false,
          size: stat?.isFile() ? stat.size : 0,
        });
        if (result.length >= limit) break;
      }
    }
  }
  return ok(result);
}

export async function fsWrite(state: AppState, body: WriteBody) {
  const root = resolveVolumeRoot(state, body.volume);
  const target = resolveUnderRoot(root, body.path);
  if (body.create_dirs !== false) {
    await ensureDir(path.dirname(target));
  }
  await fs.writeFile(target, body.content, "utf-8");
  return ok({ path: target, content: body.content });
}

export async function fsAppend(state: AppState, body: WriteBody) {
  const root = resolveVolumeRoot(state, body.volume);
  const target = resolveUnderRoot(root, body.path);
  if (body.create_dirs !== false) {
    await ensureDir(path.dirname(target));
  }
  await fs.appendFile(target, body.content, "utf-8");
  return ok({ path: target });
}

export async function fsMkdir(state: AppState, body: MkdirBody) {
  const root = resolveVolumeRoot(state, body.volume);
  const target = resolveUnderRoot(root, body.path);
  await fs.mkdir(target, { recursive: body.recursive ?? true });
  return ok({ path: target });
}

export async function fsRemove(state: AppState, body: RemoveBody) {
  const root = resolveVolumeRoot(state, body.volume);
  const target = resolveUnderRoot(root, body.path);
  const stat = await fs.stat(target);
  if (stat.isDirectory()) {
    await fs.rm(target, { recursive: body.recursive ?? false });
  } else {
    await fs.unlink(target);
  }
  return ok({ path: target });
}

export async function fsMove(state: AppState, body: MoveCopyBody) {
  const root = resolveVolumeRoot(state, body.volume);
  const from = resolveUnderRoot(root, body.from);
  const to = resolveUnderRoot(root, body.to);
  if (body.create_dirs !== false) {
    await ensureDir(path.dirname(to));
  }
  await fs.rename(from, to);
  return ok({ path: to });
}

export async function fsCopy(state: AppState, body: MoveCopyBody) {
  const root = resolveVolumeRoot(state, body.volume);
  const from = resolveUnderRoot(root, body.from);
  const to = resolveUnderRoot(root, body.to);
  if (body.create_dirs !== false) {
    await ensureDir(path.dirname(to));
  }
  await fs.copyFile(from, to);
  return ok({ path: to });
}

// --- Upload types ---

export interface UploadedFile {
  fieldname: string;
  filename: string;
  path: string;
  size: number;
}

export interface UploadResult {
  files: UploadedFile[];
}

/**
 * Handle multipart/form-data file upload.
 * Expects form field "path" for target directory and one or more "file" parts.
 */
export async function fsUpload(
  state: AppState,
  parts: {
    fields: Record<string, string>;
    files: Array<{ filename: string; data: Buffer }>;
  },
) {
  const volume = parts.fields.volume;
  const targetDir = parts.fields.path ?? ".";
  const createDirs = parts.fields.create_dirs !== "false";

  const root = resolveVolumeRoot(state, volume);
  const dir = resolveUnderRoot(root, targetDir);

  if (createDirs) await ensureDir(dir);

  const results: UploadedFile[] = [];
  for (const file of parts.files) {
    const target = resolveUnderRoot(root, path.join(targetDir, file.filename));
    await fs.writeFile(target, file.data);
    results.push({
      fieldname: "file",
      filename: file.filename,
      path: target,
      size: file.data.length,
    });
  }
  return ok({ files: results });
}
