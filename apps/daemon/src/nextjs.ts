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

import { mergeCodingRunProcessEnv } from "./coding-run-env.js";
import { parseMultipart } from "./multipart.js";
import { DaemonRouter } from "./router.js";
import { codingRunStream, type RunRequest } from "./routes/coding.js";
import { fsDownload, fsUpload } from "./routes/fs.js";
import {
  AppError,
  type AppState,
  fail,
  formatUnknownError,
  guessMimeType,
} from "./utils.js";

export function createNextHandler(opts: { root: string; prefix?: string }) {
  const router = new DaemonRouter({ root: opts.root });
  const env = process.env as Record<string, string>;
  const prefix = opts.prefix ?? "/api/daemon";
  const state: AppState = {
    root: opts.root,
    volumesRoot: `${opts.root}/volumes`,
  };

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    // Strip the mount prefix to get the daemon-internal path
    const pathname = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length) || "/"
      : url.pathname;
    const method = req.method ?? "GET";

    // Streaming: /api/coding/run → NDJSON stream
    if (method === "POST" && pathname === "/api/coding/run") {
      const body = (await req.json().catch(() => ({}))) as RunRequest;
      const mergedEnv = mergeCodingRunProcessEnv(env, body);
      return codingRunStream(body, mergedEnv);
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
        const msg =
          err instanceof Error ? err.message : formatUnknownError(err);
        return Response.json(fail(msg), { status });
      }
    }

    // Binary file download: /api/fs/download?path=...
    if (method === "GET" && pathname === "/api/fs/download") {
      try {
        const filePath = url.searchParams.get("path");
        const volume = url.searchParams.get("volume") ?? undefined;
        if (!filePath) {
          return Response.json(fail("path query parameter is required"), {
            status: 400,
          });
        }
        const { path: resolvedPath, buffer } = await fsDownload(state, {
          path: filePath,
          volume,
        });
        const mimeType = guessMimeType(resolvedPath);
        return new Response(buffer, {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(buffer.length),
          },
        });
      } catch (err) {
        const status = err instanceof AppError ? err.status : 500;
        const msg =
          err instanceof Error ? err.message : formatUnknownError(err);
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
