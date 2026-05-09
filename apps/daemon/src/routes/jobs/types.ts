import type { AppState } from "../../utils.js";

export type DaemonJobKind = "video_generation";
export type DaemonJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface DaemonJobError {
  message: string;
  code?: string;
}

export interface DaemonJobRecord {
  id: string;
  kind: DaemonJobKind;
  status: DaemonJobStatus;
  input: unknown;
  externalId?: string;
  raw?: unknown;
  error?: DaemonJobError;
  createdAt: string;
  updatedAt: string;
}

export interface DaemonJobResponse {
  id: string;
  kind: DaemonJobKind;
  status: DaemonJobStatus;
  externalId?: string;
  raw?: unknown;
  error?: DaemonJobError;
}

export type DaemonJobUpdate = {
  status: DaemonJobStatus;
  externalId?: string;
  raw?: unknown;
  error?: DaemonJobError;
};

export interface DaemonJobHandlerContext {
  state: AppState;
}

export interface DaemonJobHandler {
  kind: DaemonJobKind;
  create(
    input: unknown,
    context: DaemonJobHandlerContext,
  ): Promise<DaemonJobUpdate>;
  sync(
    record: DaemonJobRecord,
    context: DaemonJobHandlerContext,
  ): Promise<DaemonJobUpdate>;
  cancel(
    record: DaemonJobRecord,
    context: DaemonJobHandlerContext,
  ): Promise<DaemonJobUpdate>;
}

export class DaemonJobHandlerError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
