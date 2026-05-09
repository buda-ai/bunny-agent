import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ensureDir } from "../../utils.js";
import type {
  DaemonJobHandler,
  DaemonJobRecord,
  DaemonJobStatus,
  DaemonJobUpdate,
} from "./types.js";
import { DaemonJobHandlerError } from "./types.js";

type Env = Record<string, string | undefined>;

interface VideoGenerationInput {
  prompt: string;
}

interface ArkCreateResponse {
  id?: string;
}

interface ArkGetResponse {
  status?: string;
  content?: Array<{ video?: { url?: string } }>;
  error?: { message?: string } | string;
}

function resolveArkConfig(env: Env = process.env) {
  const apiKey = env.ARK_API_KEY;
  const modelId = env.ARK_MODEL_ID ?? "dreamina-seedance-2-0";
  const baseUrl =
    env.ARK_BASE_URL ?? "https://ark.ap-southeast.bytepluses.com/api/v3";
  if (!apiKey) {
    throw new DaemonJobHandlerError(
      500,
      "missing_provider_config",
      "Missing ARK_API_KEY",
    );
  }
  return { apiKey, modelId, baseUrl };
}

function parseInput(input: unknown): VideoGenerationInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new DaemonJobHandlerError(
      400,
      "invalid_input",
      "input must be an object",
    );
  }
  const prompt = (input as { prompt?: unknown }).prompt;
  if (typeof prompt !== "string" || prompt.trim() === "") {
    throw new DaemonJobHandlerError(
      400,
      "invalid_input",
      "input.prompt is required",
    );
  }
  return { prompt: prompt.trim() };
}

function mapArkStatus(raw: string | undefined): DaemonJobStatus {
  if (raw === "failed" || raw === "unknown") return "failed";
  switch (raw) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "cancelled":
      return "cancelled";
    default:
      return "failed";
  }
}

function arkErrorMessage(raw: ArkGetResponse): string | undefined {
  if (typeof raw.error === "string") return raw.error;
  return raw.error?.message;
}

function firstArkVideoUrl(raw: ArkGetResponse): string | undefined {
  return raw.content?.[0]?.video?.url;
}

async function readJsonOrText(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

async function createArkTask(
  input: VideoGenerationInput,
): Promise<{ externalId: string; raw: unknown }> {
  const { apiKey, modelId, baseUrl } = resolveArkConfig();
  const res = await fetch(`${baseUrl}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      content: [{ type: "text", text: input.prompt }],
    }),
  });
  const raw = (await readJsonOrText(res)) as ArkCreateResponse;
  if (!res.ok) {
    throw new DaemonJobHandlerError(
      502,
      "provider_create_failed",
      `Failed to create video task: ${res.status}`,
    );
  }
  if (!raw.id) {
    throw new DaemonJobHandlerError(
      502,
      "provider_create_failed",
      "No task ID returned from video generation API",
    );
  }
  return { externalId: raw.id, raw };
}

async function queryArkTask(
  externalId: string,
): Promise<{ status: DaemonJobStatus; raw: ArkGetResponse }> {
  const { apiKey, baseUrl } = resolveArkConfig();
  const res = await fetch(
    `${baseUrl}/contents/generations/tasks/${externalId}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  const raw = (await readJsonOrText(res)) as ArkGetResponse;
  if (!res.ok) {
    throw new DaemonJobHandlerError(
      502,
      "provider_query_failed",
      `Failed to check task status: ${res.status}`,
    );
  }
  return { status: mapArkStatus(raw.status), raw };
}

async function cancelArkTask(externalId: string): Promise<unknown> {
  const { apiKey, baseUrl } = resolveArkConfig();
  const res = await fetch(
    `${baseUrl}/contents/generations/tasks/${externalId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  );
  return readJsonOrText(res);
}

async function downloadVideo(jobId: string, videoUrl: string): Promise<void> {
  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new DaemonJobHandlerError(
      502,
      "video_download_failed",
      `Video download failed: ${res.status}`,
    );
  }

  const root = path.resolve(path.sep, "agent");
  const target = path.join(root, "videos", `${jobId}.mp4`);
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, Buffer.from(await res.arrayBuffer()));
}

export const videoGenerationJobHandler: DaemonJobHandler = {
  kind: "video_generation",

  async create(input: unknown): Promise<DaemonJobUpdate> {
    const created = await createArkTask(parseInput(input));
    return {
      status: "running",
      externalId: created.externalId,
      raw: created.raw,
    };
  },

  async sync(record: DaemonJobRecord): Promise<DaemonJobUpdate> {
    if (!record.externalId) {
      return { status: record.status, raw: record.raw, error: record.error };
    }

    const queried = await queryArkTask(record.externalId);
    if (queried.status === "succeeded") {
      const videoUrl = firstArkVideoUrl(queried.raw);
      if (!videoUrl) {
        return {
          status: "failed",
          raw: queried.raw,
          error: {
            message: "provider final response did not include a video url",
            code: "missing_video_url",
          },
        };
      }
      await downloadVideo(record.id, videoUrl);
    }

    if (queried.status === "failed") {
      return {
        status: "failed",
        raw: queried.raw,
        error: {
          message: arkErrorMessage(queried.raw) ?? "provider task failed",
          code: "provider_failed",
        },
      };
    }

    return {
      status: queried.status,
      raw: queried.raw,
    };
  },

  async cancel(record: DaemonJobRecord): Promise<DaemonJobUpdate> {
    const raw =
      record.externalId &&
      record.status !== "succeeded" &&
      record.status !== "failed"
        ? await cancelArkTask(record.externalId)
        : record.raw;
    return {
      status: "cancelled",
      raw,
    };
  },
};
