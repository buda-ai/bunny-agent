import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AppState } from "../utils.js";
import { AppError, ensureDir, ok } from "../utils.js";
import { getJobHandler, isSupportedJobKind } from "./jobs/handlers.js";
import {
  DaemonJobHandlerError,
  type DaemonJobKind,
  type DaemonJobRecord,
} from "./jobs/types.js";

interface CreateJobBody {
  id?: unknown;
  kind?: unknown;
  input?: unknown;
  env?: unknown;
}

interface JobParams {
  id?: unknown;
  env?: unknown;
}

const JOB_ID_RE = /^[A-Za-z0-9_-]{3,128}$/;

function jobsDir(state: AppState): string {
  return path.join(state.root, "jobs");
}

function jobPath(state: AppState, id: string): string {
  validateJobId(id);
  return path.join(jobsDir(state), `${id}.json`);
}

function validateJobId(id: string): void {
  if (!JOB_ID_RE.test(id)) {
    throw new AppError(400, `invalid job id: ${id}`);
  }
}

function parseJobId(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(400, "job id is required");
  }
  const id = value.trim();
  validateJobId(id);
  return id;
}

function parseJobKind(value: unknown): DaemonJobKind {
  if (!isSupportedJobKind(value)) {
    throw new AppError(400, `unsupported job kind: ${String(value)}`);
  }
  return value;
}

function toResponse(record: DaemonJobRecord) {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    ...(record.externalId ? { externalId: record.externalId } : {}),
    ...(record.raw !== undefined ? { raw: record.raw } : {}),
    ...(record.error ? { error: record.error } : {}),
  };
}

async function readJobRecord(
  state: AppState,
  id: string,
): Promise<DaemonJobRecord> {
  try {
    const content = await fs.readFile(jobPath(state, id), "utf8");
    return JSON.parse(content) as DaemonJobRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AppError(404, `job not found: ${id}`);
    }
    throw error;
  }
}

async function writeJobRecord(
  state: AppState,
  record: DaemonJobRecord,
): Promise<void> {
  await ensureDir(jobsDir(state));
  await fs.writeFile(
    jobPath(state, record.id),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

function handlerErrorCode(phase: "create" | "sync", error: unknown): string {
  if (error instanceof DaemonJobHandlerError) return error.code;
  return phase === "create" ? "job_create_failed" : "job_sync_failed";
}

function handlerErrorStatus(error: unknown): number {
  if (error instanceof DaemonJobHandlerError) return error.status;
  return 500;
}

function handlerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function handlerContext(state: AppState, params?: { env?: unknown }) {
  return { state, env: parseRequestEnv(params?.env) ?? process.env };
}

function parseRequestEnv(
  value: unknown,
): Record<string, string | undefined> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const env: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "string") env[key] = val;
  }
  return env;
}

export async function jobsCreate(state: AppState, body: CreateJobBody) {
  const id = parseJobId(body.id);
  const kind = parseJobKind(body.kind);
  const now = new Date().toISOString();
  const existing = await fs.stat(jobPath(state, id)).then(
    () => true,
    () => false,
  );
  if (existing) throw new AppError(409, `job already exists: ${id}`);

  const record: DaemonJobRecord = {
    id,
    kind,
    status: "queued",
    input: body.input ?? {},
    createdAt: now,
    updatedAt: now,
  };
  await writeJobRecord(state, record);

  const handler = getJobHandler(kind);
  try {
    const update = await handler.create(
      record.input,
      handlerContext(state, body),
    );
    const next: DaemonJobRecord = {
      ...record,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    await writeJobRecord(state, next);
    return ok(toResponse(next));
  } catch (error) {
    const failed: DaemonJobRecord = {
      ...record,
      status: "failed",
      error: {
        message: handlerErrorMessage(error),
        code: handlerErrorCode("create", error),
      },
      updatedAt: new Date().toISOString(),
    };
    await writeJobRecord(state, failed);
    throw new AppError(
      handlerErrorStatus(error),
      failed.error?.message ?? "job create failed",
    );
  }
}

export async function jobsSync(state: AppState, params: JobParams) {
  const id = parseJobId(params.id);
  const record = await readJobRecord(state, id);

  if (record.status !== "queued" && record.status !== "running") {
    return ok(toResponse(record));
  }

  const handler = getJobHandler(record.kind);
  try {
    const update = await handler.sync(record, handlerContext(state, params));
    const next: DaemonJobRecord = {
      ...record,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    await writeJobRecord(state, next);
    return ok(toResponse(next));
  } catch (error) {
    const failed: DaemonJobRecord = {
      ...record,
      status: "failed",
      error: {
        message: handlerErrorMessage(error),
        code: handlerErrorCode("sync", error),
      },
      updatedAt: new Date().toISOString(),
    };
    await writeJobRecord(state, failed);
    throw new AppError(
      handlerErrorStatus(error),
      failed.error?.message ?? "job sync failed",
    );
  }
}

export async function jobsCancel(state: AppState, params: JobParams) {
  const id = parseJobId(params.id);
  const record = await readJobRecord(state, id);
  const handler = getJobHandler(record.kind);
  const update = await handler.cancel(record, handlerContext(state, params));
  const next: DaemonJobRecord = {
    ...record,
    ...update,
    updatedAt: new Date().toISOString(),
  };
  await writeJobRecord(state, next);
  return ok(toResponse(next));
}
