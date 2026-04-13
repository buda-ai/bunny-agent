/**
 * GAIA Dataset Types and Downloader
 */

import type { GaiaLevel, GaiaTask } from "../types.js";

/**
 * Download GAIA dataset
 *
 * TODO: Move full implementation from benchmark-cli
 */
export async function downloadGaiaDataset(
  dataset = "validation",
): Promise<void> {
  console.log(`Downloading GAIA ${dataset} dataset...`);
  console.log("TODO: Move implementation from benchmark-cli");
  throw new Error("Not implemented - use @sandagent/benchmark-cli for now");
}

/**
 * Load GAIA tasks
 */
export async function loadGaiaTasks(
  _dataset = "validation",
  _options?: { level?: GaiaLevel },
): Promise<GaiaTask[]> {
  throw new Error("Not implemented - use @sandagent/benchmark-cli for now");
}
