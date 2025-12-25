/**
 * GAIA Dataset Downloader
 *
 * Downloads the GAIA benchmark dataset from Hugging Face
 * and processes tasks for evaluation.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GaiaLevel, GaiaTask } from "./types.js";

/**
 * Custom MIME type mapping for files not recognized by mime-types library
 */
const getCustomContentType = (fileName: string): string | undefined => {
  const extension = fileName.toLowerCase().split(".").pop();

  const customMimeTypes: Record<string, string> = {
    py: "text/x-python",
    ipynb: "application/x-ipynb+json",
    r: "text/x-r",
    sql: "text/x-sql",
    sh: "text/x-sh",
    bash: "text/x-sh",
    yml: "text/yaml",
    yaml: "text/yaml",
    toml: "application/toml",
    ini: "text/x-ini",
    cfg: "text/x-ini",
    conf: "text/x-ini",
    log: "text/x-log",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    xml: "application/xml",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    txt: "text/plain",
    text: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    mp4: "video/mp4",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    zip: "application/zip",
  };

  return extension ? customMimeTypes[extension] : undefined;
};

/**
 * Get MIME type for a file
 */
async function getMimeType(fileName: string): Promise<string> {
  try {
    const mime = await import("mime-types");
    const detected = mime.default.contentType(fileName);
    if (detected) return detected;
  } catch {
    // mime-types not available
  }

  return getCustomContentType(fileName) ?? "application/octet-stream";
}

/**
 * Download the GAIA dataset snapshot from Hugging Face
 */
async function downloadDatasetSnapshot(cacheDir: string): Promise<string> {
  const { snapshotDownload } = await import("@huggingface/hub");

  console.log("📥 Downloading GAIA dataset from Hugging Face...");

  const snapshotPath = await snapshotDownload({
    repo: {
      type: "dataset",
      name: "gaia-benchmark/GAIA",
    },
    cacheDir,
    accessToken: process.env.HUGGINGFACE_TOKEN,
  });

  console.log(`✅ Dataset downloaded to: ${snapshotPath}`);
  return snapshotPath;
}

/**
 * Load tasks from the downloaded Parquet file using hyparquet
 */
async function loadParquetData(
  snapshotDir: string,
  dataDir = "2023",
  split: "validation" | "test" = "test",
): Promise<GaiaTask[]> {
  const dataPath = join(snapshotDir, dataDir, split);
  const parquetFile = join(dataPath, "metadata.parquet");

  if (!existsSync(parquetFile)) {
    throw new Error(`Parquet file not found: ${parquetFile}`);
  }

  console.log(`📂 Loading tasks from: ${parquetFile}`);

  // Use hyparquet to read Parquet file
  const { parquetRead } = await import("hyparquet");
  const buffer = readFileSync(parquetFile);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );

  const tasks: GaiaTask[] = [];

  await parquetRead({
    file: arrayBuffer,
    rowFormat: "object",
    onComplete: (rows: unknown) => {
      const typedRows = rows as Record<string, unknown>[];
      for (const row of typedRows) {
        const levelNum = Number.parseInt(
          String(row.Level ?? row.level ?? "1"),
          10,
        );
        const level = (
          levelNum >= 1 && levelNum <= 3 ? levelNum : 1
        ) as GaiaLevel;

        const task: GaiaTask = {
          id: String(row.task_id ?? row.taskId ?? ""),
          question: String(row.Question ?? row.question ?? ""),
          level,
          answer: String(row["Final answer"] ?? row.final_answer ?? ""),
          metadata: {},
        };

        // Process Annotator Metadata
        const rawMetadata = row["Annotator Metadata"];
        if (rawMetadata) {
          if (typeof rawMetadata === "object" && rawMetadata !== null) {
            task.metadata = rawMetadata as Record<string, unknown>;
          } else if (typeof rawMetadata === "string") {
            try {
              task.metadata = JSON.parse(rawMetadata);
            } catch {
              // Ignore invalid metadata
            }
          }
        }

        // Process file attachment (path only, don't load into memory)
        const fileName = String(row.file_name ?? row.filename ?? "");
        if (fileName) {
          const filePath = join(dataPath, fileName);
          if (existsSync(filePath)) {
            task.files = [
              {
                name: fileName,
                path: filePath,
                type:
                  getCustomContentType(fileName) ?? "application/octet-stream",
              },
            ];
          }
        }

        tasks.push(task);
      }
    },
  });

  return tasks;
}

/**
 * Download and load GAIA dataset
 *
 * @param dataset - Which dataset split to load ("validation" or "test")
 * @param cacheDir - Directory to cache downloaded data (defaults to .gaia-cache)
 * @returns Array of GAIA tasks
 */
export async function downloadGaiaDataset(
  dataset: "validation" | "test" = "validation",
  cacheDir?: string,
): Promise<GaiaTask[]> {
  const cache = cacheDir ?? join(process.cwd(), ".gaia-cache");

  // Ensure cache directory exists
  if (!existsSync(cache)) {
    mkdirSync(cache, { recursive: true });
  }

  try {
    const snapshotDir = await downloadDatasetSnapshot(cache);
    const tasks = await loadParquetData(snapshotDir, "2023", dataset);

    const tasksWithFiles = tasks.filter((t) => t.files && t.files.length > 0);
    console.log(
      `✅ Loaded ${tasks.length} tasks (${tasksWithFiles.length} with files)`,
    );

    // Log level distribution
    const level1 = tasks.filter((t) => t.level === 1).length;
    const level2 = tasks.filter((t) => t.level === 2).length;
    const level3 = tasks.filter((t) => t.level === 3).length;
    console.log(
      `   Level distribution: L1=${level1}, L2=${level2}, L3=${level3}`,
    );

    return tasks;
  } catch (error) {
    console.error("❌ Failed to download dataset:", error);
    if (error instanceof Error && error.message.includes("401")) {
      console.error(
        "   Please set HUGGINGFACE_TOKEN in your .env file.\n" +
          "   Get your token from: https://huggingface.co/settings/tokens",
      );
    }
    throw error;
  }
}

/**
 * Save tasks to a JSON file for offline use
 */
export async function saveTasksToJson(
  tasks: GaiaTask[],
  outputPath: string,
): Promise<void> {
  // Don't include file data in the JSON, just paths
  const tasksForSave = tasks.map((task) => ({
    ...task,
    files: task.files?.map((f) => ({
      name: f.name,
      path: f.path,
      type: f.type,
    })),
  }));

  writeFileSync(outputPath, JSON.stringify(tasksForSave, null, 2));
  console.log(`✅ Saved ${tasks.length} tasks to: ${outputPath}`);
}

/**
 * Load tasks from a previously saved JSON file
 */
export function loadTasksFromJson(inputPath: string): GaiaTask[] {
  if (!existsSync(inputPath)) {
    throw new Error(`Tasks file not found: ${inputPath}`);
  }

  const content = readFileSync(inputPath, "utf-8");
  const tasks = JSON.parse(content) as GaiaTask[];

  console.log(`✅ Loaded ${tasks.length} tasks from: ${inputPath}`);
  return tasks;
}

/**
 * Get file content as base64 data URL for a task file
 */
export async function getFileDataUrl(filePath: string): Promise<string> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const buffer = readFileSync(filePath);
  const base64 = buffer.toString("base64");
  const fileName = filePath.split("/").pop() ?? "file";
  const mimeType = await getMimeType(fileName);

  return `data:${mimeType};base64,${base64}`;
}
