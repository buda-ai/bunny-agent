import type { DaemonJobHandler, DaemonJobKind } from "./types.js";
import { videoGenerationJobHandler } from "./video-generation.js";

const handlers = new Map<DaemonJobKind, DaemonJobHandler>([
  [videoGenerationJobHandler.kind, videoGenerationJobHandler],
]);

export function getJobHandler(kind: DaemonJobKind): DaemonJobHandler {
  const handler = handlers.get(kind);
  if (!handler) {
    throw new Error(`unsupported job kind: ${kind}`);
  }
  return handler;
}

export function isSupportedJobKind(value: unknown): value is DaemonJobKind {
  return typeof value === "string" && handlers.has(value as DaemonJobKind);
}
