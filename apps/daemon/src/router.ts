import * as fsRoutes from "./routes/fs.js";
import * as gitRoutes from "./routes/git.js";
import { healthHandler } from "./routes/health.js";
import { volumesEnsure, volumesList, volumesRemove } from "./routes/volumes.js";
import type { ApiEnvelope, AppState } from "./utils.js";
import { AppError, fail, formatUnknownError } from "./utils.js";

// biome-ignore lint/suspicious/noExplicitAny: route handlers have specific typed params, cast is intentional
type RouteHandler = (state: AppState, params: any) => Promise<ApiEnvelope>;

export class DaemonRouter {
  private state: AppState;
  private routes: [string, string, RouteHandler][];

  constructor(opts: { root: string }) {
    this.state = {
      root: opts.root,
      volumesRoot: `${opts.root}/volumes`,
    };
    this.routes = [
      ["GET", "/api/volumes/list", (s) => volumesList(s)],
      ["POST", "/api/volumes/ensure", (s, b) => volumesEnsure(s, b)],
      ["POST", "/api/volumes/remove", (s, b) => volumesRemove(s, b)],
      ["GET", "/api/fs/list", (s, q) => fsRoutes.fsList(s, q)],
      ["GET", "/api/fs/read", (s, q) => fsRoutes.fsRead(s, q)],
      ["GET", "/api/fs/stat", (s, q) => fsRoutes.fsStat(s, q)],
      ["GET", "/api/fs/exists", (s, q) => fsRoutes.fsExists(s, q)],
      ["GET", "/api/fs/find", (s, q) => fsRoutes.fsFind(s, q)],
      ["POST", "/api/fs/write", (s, b) => fsRoutes.fsWrite(s, b)],
      ["POST", "/api/fs/append", (s, b) => fsRoutes.fsAppend(s, b)],
      ["POST", "/api/fs/mkdir", (s, b) => fsRoutes.fsMkdir(s, b)],
      ["POST", "/api/fs/remove", (s, b) => fsRoutes.fsRemove(s, b)],
      ["POST", "/api/fs/move", (s, b) => fsRoutes.fsMove(s, b)],
      ["POST", "/api/fs/copy", (s, b) => fsRoutes.fsCopy(s, b)],
      ["POST", "/api/git/status", (s, b) => gitRoutes.gitStatus(s, b)],
      ["POST", "/api/git/exec", (s, b) => gitRoutes.gitExec(s, b)],
      ["POST", "/api/git/clone", (s, b) => gitRoutes.gitClone(s, b)],
      ["POST", "/api/git/init", (s, b) => gitRoutes.gitInit(s, b)],
    ];
  }

  async handle(
    method: string,
    pathname: string,
    params: Record<string, unknown>,
  ): Promise<{ status: number; body: ApiEnvelope } | null> {
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
          return {
            status: 500,
            body: fail(
              err instanceof Error ? err.message : formatUnknownError(err),
            ),
          };
        }
      }
    }
    return null;
  }
}
