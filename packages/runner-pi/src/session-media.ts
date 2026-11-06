/** Image storage for Pi transcripts. Keep the sibling .media directory with JSONL backups. */
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/** Encoded image bytes hydrated for one session, including repeated blocks. */
export const MAX_SESSION_MEDIA_BYTES = 64 * 1024 * 1024;

function hydrationLimit(): number {
  const configured = Number(process.env.SANDAGENT_MAX_SESSION_MEDIA_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : MAX_SESSION_MEDIA_BYTES;
}

function assertMediaBudget(bytes: number): void {
  const limit = hydrationLimit();
  if (bytes > limit) {
    throw new Error(
      `Session image data exceeds the ${limit}-byte hydration limit; the original session is preserved. ` +
        "Set SANDAGENT_MAX_SESSION_MEDIA_BYTES to a larger positive byte limit only when enough memory is available.",
    );
  }
}

interface MediaReference {
  version: 1;
  sha256: string;
  encoding: "base64";
}

function digest(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function mediaPath(sessionPath: string, hash: string): string {
  return join(dirname(sessionPath), ".media", `${hash}.base64`);
}

function validatedMediaPath(
  sessionPath: string,
  reference: MediaReference,
): string {
  if (
    reference.version !== 1 ||
    reference.encoding !== "base64" ||
    !/^[a-f0-9]{64}$/.test(reference.sha256)
  ) {
    throw new Error(`Invalid image reference in session ${sessionPath}`);
  }
  return mediaPath(sessionPath, reference.sha256);
}

function mediaSize(path: string): number {
  try {
    return statSync(path).size;
  } catch (error) {
    throw new Error(`Cannot restore session image ${path}: ${String(error)}`);
  }
}

function readMedia(sessionPath: string, reference: MediaReference): string {
  const path = validatedMediaPath(sessionPath, reference);
  // Check before allocating the blob, including during migration validation.
  assertMediaBudget(mediaSize(path));
  let data: string;
  try {
    data = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Cannot restore session image ${path}: ${String(error)}`);
  }
  if (digest(data) !== reference.sha256) {
    throw new Error(`Session image checksum mismatch: ${path}`);
  }
  return data;
}

function storeMedia(sessionPath: string, data: string): MediaReference {
  assertMediaBudget(Buffer.byteLength(data, "utf8"));
  const reference: MediaReference = {
    version: 1,
    sha256: digest(data),
    encoding: "base64",
  };
  const path = mediaPath(sessionPath, reference.sha256);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (existsSync(path)) {
    readMedia(sessionPath, reference);
    return reference;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    try {
      // Publish a complete file without replacing a concurrent writer's copy.
      linkSync(temporary, path);
      const directory = openSync(dirname(path), "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      readMedia(sessionPath, reference);
    }
  } finally {
    unlinkSync(temporary);
  }
  return reference;
}

/** Inspect the complete entry tree before allocating any referenced image data. */
function preflightHydration(value: unknown, sessionPath: string): void {
  let bytes = 0;
  function visit(item: unknown): void {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (!item || typeof item !== "object") return;
    const object = item as Record<string, unknown>;
    if (object.type === "image" && typeof object.mimeType === "string") {
      if (object.bunnyMedia !== undefined) {
        if (!object.bunnyMedia || typeof object.bunnyMedia !== "object") {
          throw new Error(`Invalid image reference in session ${sessionPath}`);
        }
        bytes += mediaSize(
          validatedMediaPath(sessionPath, object.bunnyMedia as MediaReference),
        );
      } else if (typeof object.data === "string") {
        bytes += Buffer.byteLength(object.data, "utf8");
      }
      assertMediaBudget(bytes);
      return;
    }
    for (const child of Object.values(object)) visit(child);
  }
  visit(value);
}

function transform(
  value: unknown,
  sessionPath: string,
  hydrate: boolean,
): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => transform(item, sessionPath, hydrate));
    return items.every((item, index) => item === value[index]) ? value : items;
  }
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  if (object.type === "image" && typeof object.mimeType === "string") {
    if (object.bunnyMedia !== undefined) {
      if (!object.bunnyMedia || typeof object.bunnyMedia !== "object") {
        throw new Error(`Invalid image reference in session ${sessionPath}`);
      }
      const reference = object.bunnyMedia as MediaReference;
      // Also validate references during migration, before publishing its new JSONL.
      const data = readMedia(sessionPath, reference);
      if (hydrate) {
        const { bunnyMedia: _reference, ...image } = object;
        return { ...image, data };
      }
      return object;
    }
    if (!hydrate && typeof object.data === "string") {
      const { data, ...image } = object;
      return { ...image, bunnyMedia: storeMedia(sessionPath, data) };
    }
  }
  let result = object;
  for (const [key, item] of Object.entries(object)) {
    const next = transform(item, sessionPath, hydrate);
    if (next !== item) {
      if (result === object) result = { ...object };
      result[key] = next;
    }
  }
  return result;
}

/** Pure live-message boundary: encode never mutates Pi's in-memory image blocks. */
export const sessionMediaCodec = {
  encode(entry: unknown, sessionPath: string): unknown {
    return transform(entry, sessionPath, false);
  },
  decode(entry: unknown, sessionPath: string): unknown {
    preflightHydration(entry, sessionPath);
    return transform(entry, sessionPath, true);
  },
};
