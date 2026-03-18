import * as fs from "node:fs/promises";
import type { AppState } from "../utils.js";
import { ok, resolveVolumeRoot, ensureDir } from "../utils.js";

export async function volumesList(state: AppState) {
  const entries = await fs.readdir(state.volumesRoot, { withFileTypes: true });
  const volumes = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return ok({ volumes });
}

export async function volumesEnsure(state: AppState, body: { volume: string }) {
  const root = resolveVolumeRoot(state, body.volume);
  await ensureDir(root);
  return ok({ path: root });
}

export async function volumesRemove(state: AppState, body: { volume: string; recursive?: boolean }) {
  const root = resolveVolumeRoot(state, body.volume);
  await fs.rm(root, { recursive: body.recursive ?? true });
  return ok({ path: root });
}
