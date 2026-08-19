/**
 * Next.js Route Handler adapter for bunny-agent-daemon.
 *
 * Usage in Next.js app router:
 *
 *   // app/api/daemon/[...path]/route.ts
 *   import { createNextHandler } from "@bunny-agent/daemon/nextjs";
 *   const handler = createNextHandler({ root: "/workspace", prefix: "/api/daemon" });
 *   export const GET = handler;
 *   export const POST = handler;
 *
 * Requests to /api/daemon/healthz           → daemon /healthz
 * Requests to /api/daemon/api/fs/read       → daemon /api/fs/read
 * Requests to /api/daemon/api/fs/download   → daemon /api/fs/download (binary)
 * Requests to /api/daemon/api/coding/run    → daemon /api/coding/run (NDJSON stream)
 */

import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createAcpHttpServer } from "@bunny-agent/server-acp";
import { createAiSdkCodingRunServer } from "@bunny-agent/server-ai-sdk";
import {
  type CodingRunBodyWithEnv,
  prepareCodingRunEnv,
} from "./coding-run-env.js";
import { parseMultipart } from "./multipart.js";
import { DaemonRouter } from "./router.js";
import { fsDownload, fsUpload, fsWriteStream } from "./routes/fs.js";
import { AppError, type AppState, fail, guessMimeType } from "./utils.js";

export function createNextHandler(opts: { root: string; prefix?: string }) {
  const router = new DaemonRouter({ root: opts.root });
  const env = process.env as Record<string, string>;
  const prefix = opts.prefix ?? "/api/daemon";
  const state: AppState = {
    root: opts.root,
    volumesRoot: `${opts.root}/volumes`,
  };
  const codingRunServers = [
    createAiSdkCodingRunServer({
      prepareEnv: (body) =>
        prepareCodingRunEnv(env, body as CodingRunBodyWithEnv),
    }),
    createAcpHttpServer({ defaultCwd: opts.root, env }),
  ];

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    // Strip the mount prefix to get the daemon-internal path
    const pathname = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length) || "/"
      : url.pathname;
    const method = req.method ?? "GET";

    // AI SDK is POST-only. ACP Streamable HTTP additionally uses GET for
    // connection/session SSE streams and DELETE to close the connection.
    const codingRunServer = codingRunServers.find(
      (server) => server.mountPath === pathname,
    );
    if (
      codingRunServer &&
      (method === "POST" ||
        (codingRunServer.protocol === "acp" &&
          (method === "GET" || method === "DELETE")))
    ) {
      return codingRunServer.handleWebRequest(req);
    }

    // Raw streamed upload: /api/fs/write-stream?path=...
    if (method === "PUT" && pathname === "/api/fs/write-stream") {
      try {
        if (!req.body) {
          return Response.json(fail("request body is required"), {
            status: 400,
          });
        }
        const result = await fsWriteStream(state, Readable.fromWeb(req.body), {
          path: url.searchParams.get("path"),
          volume: url.searchParams.get("volume") ?? undefined,
          create_dirs: url.searchParams.get("create_dirs") !== "false",
          max_bytes: parseOptionalNumber(url.searchParams.get("max_bytes")),
        });
        return Response.json(result);
      } catch (err) {
        const status = err instanceof AppError ? err.status : 500;
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json(fail(msg), { status });
      }
    }

    // Multipart upload: /api/fs/upload
    if (method === "POST" && pathname === "/api/fs/upload") {
      try {
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.includes("multipart/form-data")) {
          return Response.json(
            fail("content-type must be multipart/form-data"),
            { status: 400 },
          );
        }
        const raw = Buffer.from(await req.arrayBuffer());
        const parts = parseMultipart(ct, raw);
        const result = await fsUpload(state, parts);
        return Response.json(result);
      } catch (err) {
        const status = err instanceof AppError ? err.status : 500;
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json(fail(msg), { status });
      }
    }

    // Binary file download: /api/fs/download?path=... (streamed)
    if (method === "GET" && pathname === "/api/fs/download") {
      try {
        const filePath = url.searchParams.get("path");
        const volume = url.searchParams.get("volume") ?? undefined;
        if (!filePath) {
          return Response.json(fail("path query parameter is required"), {
            status: 400,
          });
        }
        const { path: resolvedPath, size } = await fsDownload(state, {
          path: filePath,
          volume,
        });
        const mimeType = guessMimeType(resolvedPath);
        // Node's createReadStream is an async iterable — wrap it in a Web
        // ReadableStream so we can hand it to `new Response(...)` and stream
        // the body end-to-end without buffering the whole file.
        const nodeStream = createReadStream(resolvedPath);
        const webStream = Readable.toWeb(nodeStream) as ReadableStream;
        return new Response(webStream, {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(size),
          },
        });
      } catch (err) {
        const status = err instanceof AppError ? err.status : 500;
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json(fail(msg), { status });
      }
    }

    // Standard JSON routes
    const params =
      method === "GET"
        ? Object.fromEntries(url.searchParams)
        : ((await req.json().catch(() => ({}))) as Record<string, unknown>);

    const result = await router.handle(method, pathname, params);
    if (!result) {
      return Response.json(
        { ok: false, data: null, error: `not found: ${method} ${pathname}` },
        { status: 404 },
      );
    }
    return Response.json(result.body, { status: result.status });
  };
}

function parseOptionalNumber(value: string | null): number | undefined {
  return value == null ? undefined : Number(value);
}
