import type { AppState, ApiEnvelope } from "./utils.js";
import { fail, AppError } from "./utils.js";
import { healthHandler } from "./routes/health.js";
import { volumesList, volumesEnsure, volumesRemove } from "./routes/volumes.js";
import * as fsRoutes from "./routes/fs.js";
import * as gitRoutes from "./routes/git.js";

type RouteHandler = (state: AppState, params: Record<string, unknown>) => Promise<ApiEnvelope>;

export class DaemonRouter {
  private state: AppState;
  private routes: [string, string, RouteHandler][];

  constructor(opts: { root: string }) {
    this.state = {
      root: opts.root,
      volumesRoot: `${opts.root}/volumes`,
    };
    this.routes = [
      // Volumes
      ["GET", "/api/volumes/list", (s) => volumesList(s)],
      ["POST", "/api/volumes/ensure", (s, b) => volumesEnsure(s, b as any)],
      ["POST", "/api/volumes/remove", (s, b) => volumesRemove(s, b as any)],
      // Filesystem
      ["GET", "/api/fs/list", (s, q) => fsRoutes.fsList(s, q as any)],
      ["GET", "/api/fs/read", (s, q) => fsRoutes.fsRead(s, q as any)],
      ["GET", "/api/fs/stat", (s, q) => fsRoutes.fsStat(s, q as any)],
      ["GET", "/api/fs/exists", (s, q) => fsRoutes.fsExists(s, q as any)],
      ["GET", "/api/fs/find", (s, q) => fsRoutes.fsFind(s, q as any)],
      ["POST", "/api/fs/write", (s, b) => fsRoutes.fsWrite(s, b as any)],
      ["POST", "/api/fs/append", (s, b) => fsRoutes.fsAppend(s, b as any)],
      ["POST", "/api/fs/mkdir", (s, b) => fsRoutes.fsMkdir(s, b as any)],
      ["POST", "/api/fs/remove", (s, b) => fsRoutes.fsRemove(s, b as any)],
      ["POST", "/api/fs/move", (s, b) => fsRoutes.fsMove(s, b as any)],
      ["POST", "/api/fs/copy", (s, b) => fsRoutes.fsCopy(s, b as any)],
      // Git
      ["POST", "/api/git/status", (s, b) => gitRoutes.gitStatus(s, b as any)],
      ["POST", "/api/git/exec", (s, b) => gitRoutes.gitExec(s, b as any)],
      ["POST", "/api/git/clone", (s, b) => gitRoutes.gitClone(s, b as any)],
      ["POST", "/api/git/init", (s, b) => gitRoutes.gitInit(s, b as any)],
    ];
  }

  async handle(method: string, pathname: string, params: Record<string, unknown>): Promise<{ status: number; body: ApiEnvelope } | null> {
    if (pathname === "/healthz" && method === "GET") {
      return { status: 200, body: healthHandler(this.state) };
    }
    for (const [m, p, handler] of this.routes) {
      if (method === m && pathname === p) {
        try {
          return { status: 200, body: await handler(this.state, params) };
        } catch (err) {
          if (err instanceof AppError) {
            return { status: err.status, body: fail(err.message) };
          }
          return { status: 500, body: fail(err instanceof Error ? err.message : String(err)) };
        }
      }
    }
    return null;
  }
}
