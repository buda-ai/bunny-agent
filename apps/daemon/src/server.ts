import * as http from "node:http";
import { URL } from "node:url";
import { parseMultipart } from "./multipart.js";
import { DaemonRouter } from "./router.js";
import { sandagentRun } from "./routes/coding.js";
import { fsUpload } from "./routes/fs.js";
import { AppError, type AppState, fail } from "./utils.js";

export interface DaemonConfig {
  host: string;
  port: number;
  root: string;
}

export function createDaemon(config: DaemonConfig): http.Server {
  const router = new DaemonRouter({ root: config.root });
  const env = process.env as Record<string, string>;
  const state: AppState = {
    root: config.root,
    volumesRoot: `${config.root}/volumes`,
  };

  return http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const pathname = url.pathname;

    // Streaming: /api/coding/run
    if (method === "POST" && pathname === "/api/coding/run") {
      const body = JSON.parse((await readBody(req)) || "{}");
      return sandagentRun(body, res, env);
    }

    // Multipart upload: /api/fs/upload
    if (method === "POST" && pathname === "/api/fs/upload") {
      try {
        const ct = req.headers["content-type"] ?? "";
        if (!ct.includes("multipart/form-data")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify(fail("content-type must be multipart/form-data")),
          );
          return;
        }
        const raw = await readBodyRaw(req);
        const parts = parseMultipart(ct, raw);
        const result = await fsUpload(state, parts);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        const status = err instanceof AppError ? err.status : 500;
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(fail(msg)));
      }
      return;
    }

    // Standard JSON routes
    const params =
      method === "GET"
        ? Object.fromEntries(url.searchParams)
        : JSON.parse((await readBody(req)) || "{}");

    const result = await router.handle(method, pathname, params);
    const status = result?.status ?? 404;
    const body = result?.body ?? fail(`not found: ${method} ${pathname}`);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function readBodyRaw(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
