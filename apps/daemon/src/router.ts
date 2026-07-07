import * as fsRoutes from "./routes/fs.js";
import * as gitRoutes from "./routes/git.js";
import { healthHandler } from "./routes/health.js";
import * as processRoutes from "./routes/processes.js";
import { sessionFork } from "./routes/sessions.js";
import * as siteRoutes from "./routes/site.js";
import { volumesEnsure, volumesList, volumesRemove } from "./routes/volumes.js";
import type { ApiEnvelope, AppState } from "./utils.js";
import { AppError, fail } from "./utils.js";

type RouteHandler = (
  state: AppState,
  // biome-ignore lint/suspicious/noExplicitAny: route handlers have specific typed params, cast is intentional
  params: any,
) => Promise<ApiEnvelope>;
type Route = [method: string, pattern: string, handler: RouteHandler];

export class DaemonRouter {
  private state: AppState;
  private routes: Route[];

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
      [
        "GET",
        "/api/sandbox/processes",
        (s) => processRoutes.sandboxProcesses(s),
      ],
      ["POST", "/api/fs/write", (s, b) => fsRoutes.fsWrite(s, b)],
      ["POST", "/api/fs/append", (s, b) => fsRoutes.fsAppend(s, b)],
      ["POST", "/api/fs/mkdir", (s, b) => fsRoutes.fsMkdir(s, b)],
      ["POST", "/api/fs/remove", (s, b) => fsRoutes.fsRemove(s, b)],
      ["POST", "/api/fs/move", (s, b) => fsRoutes.fsMove(s, b)],
      ["POST", "/api/fs/copy", (s, b) => fsRoutes.fsCopy(s, b)],
      [
        "POST",
        "/api/fs/write-from-url",
        (s, b) => fsRoutes.fsWriteFromUrl(s, b),
      ],
      ["POST", "/api/git/status", (s, b) => gitRoutes.gitStatus(s, b)],
      ["POST", "/api/git/exec", (s, b) => gitRoutes.gitExec(s, b)],
      ["POST", "/api/git/clone", (s, b) => gitRoutes.gitClone(s, b)],
      ["POST", "/api/git/init", (s, b) => gitRoutes.gitInit(s, b)],
      ["POST", "/api/git/rpc", (s, b) => gitRoutes.gitRpc(s, b)],
      [
        "POST",
        "/api/git/simple-git-rpc",
        (s, b) => gitRoutes.simpleGitRpc(s, b),
      ],
      ["POST", "/api/site/deploy", (s, b) => siteRoutes.deploy(s, b)],
      ["POST", "/api/site/redeploy", (s, b) => siteRoutes.redeploy(s, b)],
      ["POST", "/api/site/delete", (s, b) => siteRoutes.deleteSite(s, b)],
      ["POST", "/api/session/fork", (s, b) => sessionFork(s, b)],
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
      if (method !== m) continue;
      if (p === pathname) {
        try {
          return {
            status: 200,
            body: await handler(this.state, params),
          };
        } catch (err) {
          if (err instanceof AppError) {
            return { status: err.status, body: fail(err.message) };
          }
          return {
            status: 500,
            body: fail(err instanceof Error ? err.message : String(err)),
          };
        }
      }
    }
    return null;
  }
}
