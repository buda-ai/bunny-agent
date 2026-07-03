import * as http from "node:http";
import { URL } from "node:url";
import {
  type CodingRunBodyWithEnv,
  prepareCodingRunEnv,
} from "./coding-run-env.js";
import { parseMultipart } from "./multipart.js";
import { DaemonRouter } from "./router.js";
import { bunnyAgentRun } from "./routes/coding.js";
import { codingSessionDir } from "./routes/coding-session-dir.js";
import { fsDownload, fsUpload, fsWriteStream } from "./routes/fs.js";
import { AppError, type AppState, fail, guessMimeType, ok } from "./utils.js";

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
    try {
      const method = req.method ?? "GET";
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );
      const pathname = url.pathname;

      // Streaming: /api/coding/run
      if (method === "POST" && pathname === "/api/coding/run") {
        const body = safeJsonParse(await readBody(req)) as Record<
          string,
          unknown
        >;
        const { env: mergedEnv, systemEnv } = prepareCodingRunEnv(
          env,
          body as CodingRunBodyWithEnv,
        );
        body.systemEnv = systemEnv;
        return bunnyAgentRun(
          body as unknown as Parameters<typeof bunnyAgentRun>[0],
          res,
          mergedEnv,
        );
      }

      // Session directory lookup: /api/coding/session/dir?runner=pi&cwd=/agent
      if (method === "GET" && pathname === "/api/coding/session/dir") {
        try {
          const result = codingSessionDir({
            runner: url.searchParams.get("runner") ?? undefined,
            cwd: url.searchParams.get("cwd") ?? undefined,
          });
          sendJson(res, 200, ok(result));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          sendJson(res, 400, fail(msg));
        }
        return;
      }

      // Raw streamed upload: /api/fs/write-stream?path=...
      if (method === "PUT" && pathname === "/api/fs/write-stream") {
        try {
          const result = await fsWriteStream(state, req, {
            path: url.searchParams.get("path"),
            volume: url.searchParams.get("volume") ?? undefined,
            create_dirs: url.searchParams.get("create_dirs") !== "false",
            max_bytes: parseOptionalNumber(url.searchParams.get("max_bytes")),
          });
          sendJson(res, 200, result);
        } catch (err) {
          const status = err instanceof AppError ? err.status : 500;
          const msg = err instanceof Error ? err.message : String(err);
          sendJson(res, status, fail(msg));
        }
        return;
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

      // Binary file download: /api/fs/download?path=...
      if (method === "GET" && pathname === "/api/fs/download") {
        try {
          const filePath = url.searchParams.get("path");
          const volume = url.searchParams.get("volume") ?? undefined;
          if (!filePath) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify(fail("path query parameter is required")));
            return;
          }
          const { path: resolvedPath, buffer } = await fsDownload(state, {
            path: filePath,
            volume,
          });
          const mimeType = guessMimeType(resolvedPath);
          res.writeHead(200, {
            "Content-Type": mimeType,
            "Content-Length": buffer.length,
          });
          res.end(buffer);
        } catch (err) {
          const status = err instanceof AppError ? err.status : 500;
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(fail(msg)));
        }
        return;
      }

      // Standard JSON routes
      let params: Record<string, unknown>;
      if (method === "GET") {
        params = Object.fromEntries(url.searchParams);
      } else {
        const ct = req.headers["content-type"] ?? "";
        if (
          ct.includes("multipart/form-data") ||
          ct.includes("application/x-www-form-urlencoded")
        ) {
          sendJson(
            res,
            400,
            fail(
              `Endpoint ${pathname} expects JSON body (content-type: application/json)`,
            ),
          );
          return;
        }
        params = safeJsonParse(await readBody(req));
      }

      const result = await router.handle(method, pathname, params);
      const status = result?.status ?? 404;
      const body = result?.body ?? fail(`not found: ${method} ${pathname}`);
      sendJson(res, status, body);
    } catch (err) {
      // Top-level safety net: never let the server crash
      if (!res.headersSent) {
        if (err instanceof AppError) {
          sendJson(res, err.status, fail(err.message));
        } else {
          console.error("Unhandled request error:", err);
          const msg = err instanceof Error ? err.message : String(err);
          sendJson(res, 500, fail(`Internal server error: ${msg}`));
        }
      } else {
        console.error("Unhandled request error (headers already sent):", err);
      }
    }
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseOptionalNumber(value: string | null): number | undefined {
  return value == null ? undefined : Number(value);
}

/** Safely parse JSON, returning {} on invalid input instead of throwing. */
function safeJsonParse(text: string): Record<string, unknown> {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new AppError(400, `Invalid JSON body: ${trimmed.slice(0, 120)}`);
  }
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
